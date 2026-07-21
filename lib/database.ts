import * as SQLite from "expo-sqlite";

export type Expense = {
  id: number;
  merchant: string;
  amount: number;
  category: string;
  person: string;
  tag: string | null;
  note: string | null;
  bank: string | null;
  rawBody: string | null;
  occurredAt: string;
  source: "sms" | "manual";
};

export type NewExpense = Omit<Expense, "id">;

export type ExpenseUpdate = {
  merchant: string;
  amount: number;
  category: string;
  person: string;
  tag: string | null;
  note: string | null;
  occurredAt: string;
};

export type ManagedList = "categories" | "people";

export const defaultCategories = [
  "Food",
  "Grocery",
  "Shopping",
  "Travel",
  "Entertainment",
  "Bills",
  "Medical",
  "Fuel",
  "Others",
];
export const defaultPeople = ["Alone", "Friends", "Family", "Partner"];

const database = SQLite.openDatabaseSync("tracko.db");

function columnExists(table: string, column: string) {
  const columns = database.getAllSync<{ name: string }>(
    `PRAGMA table_info(${table})`,
  );
  return columns.some((entry) => entry.name === column);
}

function addColumnIfMissing(table: string, column: string, type: string) {
  if (!columnExists(table, column)) {
    database.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function initializeDatabase() {
  database.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      person TEXT NOT NULL,
      tag TEXT,
      occurred_at TEXT NOT NULL,
      source TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS merchant_memory (
      merchant TEXT NOT NULL,
      category TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (merchant, category)
    );
  `);

  // Additive migrations for existing installs.
  addColumnIfMissing("expenses", "note", "TEXT");
  addColumnIfMissing("expenses", "bank", "TEXT");
  addColumnIfMissing("expenses", "raw_body", "TEXT");
}

function preferenceKey(list: ManagedList) {
  return `tracko.${list}`;
}

export function getPreference(key: string) {
  return (
    database.getFirstSync<{ value: string }>(
      "SELECT value FROM preferences WHERE key = ?",
      [key],
    )?.value ?? null
  );
}

export function setPreference(key: string, value: string) {
  database.runSync(
    "INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)",
    [key, value],
  );
}

export function getManagedList(list: ManagedList) {
  const stored = database.getFirstSync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?",
    [preferenceKey(list)],
  );
  const fallback = list === "categories" ? defaultCategories : defaultPeople;
  if (!stored) return fallback;
  try {
    const items = JSON.parse(stored.value);
    return Array.isArray(items) &&
      items.every((item) => typeof item === "string")
      ? items
      : fallback;
  } catch {
    return fallback;
  }
}

export function setManagedList(list: ManagedList, items: string[]) {
  database.runSync(
    "INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)",
    [preferenceKey(list), JSON.stringify(items)],
  );
}

export function getDefaultPerson() {
  return (
    database.getFirstSync<{ value: string }>(
      "SELECT value FROM preferences WHERE key = ?",
      ["tracko.default-person"],
    )?.value ?? "Alone"
  );
}

export function setDefaultPerson(person: string) {
  database.runSync(
    "INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)",
    ["tracko.default-person", person],
  );
}

export function renameManagedValue(
  list: ManagedList,
  previous: string,
  next: string,
) {
  if (list === "categories") {
    database.runSync("UPDATE expenses SET category = ? WHERE category = ?", [
      next,
      previous,
    ]);
    database.runSync(
      "UPDATE merchant_memory SET category = ? WHERE category = ?",
      [next, previous],
    );
  }
  if (list === "people") {
    database.runSync("UPDATE expenses SET person = ? WHERE person = ?", [
      next,
      previous,
    ]);
  }
}

export function managedValueUsage(list: ManagedList, value: string) {
  const column = list === "categories" ? "category" : "person";
  return (
    database.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM expenses WHERE ${column} = ?`,
      [value],
    )?.count ?? 0
  );
}

const EXPENSE_COLUMNS =
  "id, merchant, amount, category, person, tag, note, bank, raw_body AS rawBody, occurred_at AS occurredAt, source";

export function getExpenses() {
  return database.getAllSync<Expense>(
    `SELECT ${EXPENSE_COLUMNS} FROM expenses ORDER BY occurred_at DESC`,
  );
}

export function saveExpense(expense: NewExpense) {
  const result = database.runSync(
    `INSERT INTO expenses
      (merchant, amount, category, person, tag, note, bank, raw_body, occurred_at, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      expense.merchant,
      expense.amount,
      expense.category,
      expense.person,
      expense.tag,
      expense.note ?? null,
      expense.bank ?? null,
      expense.rawBody ?? null,
      expense.occurredAt,
      expense.source,
    ],
  );
  recordMerchantCategory(expense.merchant, expense.category);
  return result.lastInsertRowId;
}

export function updateExpense(id: number, expense: ExpenseUpdate) {
  database.runSync(
    `UPDATE expenses
     SET merchant = ?, amount = ?, category = ?, person = ?, tag = ?, note = ?, occurred_at = ?
     WHERE id = ?`,
    [
      expense.merchant,
      expense.amount,
      expense.category,
      expense.person,
      expense.tag,
      expense.note,
      expense.occurredAt,
      id,
    ],
  );
  recordMerchantCategory(expense.merchant, expense.category);
}

export function removeExpense(id: number) {
  database.runSync("DELETE FROM expenses WHERE id = ?", [id]);
}

function normalizeMerchant(merchant: string) {
  return merchant.trim().toLowerCase();
}

export function recordMerchantCategory(merchant: string, category: string) {
  const key = normalizeMerchant(merchant);
  if (!key) return;
  database.runSync(
    `INSERT INTO merchant_memory (merchant, category, count) VALUES (?, ?, 1)
     ON CONFLICT(merchant, category) DO UPDATE SET count = count + 1`,
    [key, category],
  );
}

/**
 * Returns the category the user most often assigns to a given merchant, or null
 * if there is no history yet. This powers the "app learns" behaviour.
 */
export function getLearnedCategory(merchant: string): string | null {
  const key = normalizeMerchant(merchant);
  if (!key) return null;
  return (
    database.getFirstSync<{ category: string }>(
      `SELECT category FROM merchant_memory
       WHERE merchant = ?
       ORDER BY count DESC, category ASC
       LIMIT 1`,
      [key],
    )?.category ?? null
  );
}

/** Best learned category for every known merchant (normalized lowercase key). */
export function getMerchantCategoryMap(): Record<string, string> {
  const rows = database.getAllSync<{
    merchant: string;
    category: string;
    count: number;
  }>(
    "SELECT merchant, category, count FROM merchant_memory ORDER BY count DESC",
  );
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (!(row.merchant in map)) map[row.merchant] = row.category;
  }
  return map;
}

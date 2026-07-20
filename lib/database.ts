import * as SQLite from "expo-sqlite";

export type Expense = {
  id: number;
  merchant: string;
  amount: number;
  category: string;
  person: string;
  tag: string | null;
  occurredAt: string;
  source: "sms" | "manual";
};

export type ManagedList = "categories" | "people";

export const defaultCategories = ["Food", "Grocery", "Shopping", "Travel", "Entertainment", "Bills", "Medical", "Fuel", "Others"];
export const defaultPeople = ["Alone", "Friends", "Family", "Partner"];

const database = SQLite.openDatabaseSync("tracko.db");

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
  `);
}

function preferenceKey(list: ManagedList) {
  return `tracko.${list}`;
}

export function getManagedList(list: ManagedList) {
  const stored = database.getFirstSync<{ value: string }>("SELECT value FROM preferences WHERE key = ?", [preferenceKey(list)]);
  const fallback = list === "categories" ? defaultCategories : defaultPeople;
  if (!stored) return fallback;
  try {
    const items = JSON.parse(stored.value);
    return Array.isArray(items) && items.every((item) => typeof item === "string") ? items : fallback;
  } catch {
    return fallback;
  }
}

export function setManagedList(list: ManagedList, items: string[]) {
  database.runSync("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)", [preferenceKey(list), JSON.stringify(items)]);
}

export function getDefaultPerson() {
  return database.getFirstSync<{ value: string }>("SELECT value FROM preferences WHERE key = ?", ["tracko.default-person"])?.value ?? "Alone";
}

export function setDefaultPerson(person: string) {
  database.runSync("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)", ["tracko.default-person", person]);
}

export function renameManagedValue(list: ManagedList, previous: string, next: string) {
  if (list === "categories") database.runSync("UPDATE expenses SET category = ? WHERE category = ?", [next, previous]);
  if (list === "people") database.runSync("UPDATE expenses SET person = ? WHERE person = ?", [next, previous]);
}

export function managedValueUsage(list: ManagedList, value: string) {
  const column = list === "categories" ? "category" : "person";
  return database.getFirstSync<{ count: number }>(`SELECT COUNT(*) AS count FROM expenses WHERE ${column} = ?`, [value])?.count ?? 0;
}

export function getExpenses() {
  return database.getAllSync<Expense>(
    "SELECT id, merchant, amount, category, person, tag, occurred_at AS occurredAt, source FROM expenses ORDER BY occurred_at DESC"
  );
}

export function saveExpense(expense: Omit<Expense, "id">) {
  const result = database.runSync(
    "INSERT INTO expenses (merchant, amount, category, person, tag, occurred_at, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [expense.merchant, expense.amount, expense.category, expense.person, expense.tag, expense.occurredAt, expense.source]
  );
  return result.lastInsertRowId;
}

export function removeExpense(id: number) {
  database.runSync("DELETE FROM expenses WHERE id = ?", [id]);
}

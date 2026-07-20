import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Modal,
  PermissionsAndroid,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import TrackoSms, {
  PaymentTransaction,
  TrackingDiagnostics,
} from "@/modules/tracko-sms";

import {
  Expense,
  getDefaultPerson,
  getExpenses,
  getManagedList,
  initializeDatabase,
  ManagedList,
  managedValueUsage,
  setManagedList as persistManagedList,
  removeExpense,
  renameManagedValue,
  saveExpense,
  setDefaultPerson,
} from "@/lib/database";

const categoryColors: Record<string, string> = {
  Food: "#FFD8A8",
  Grocery: "#C7E9C0",
  Shopping: "#E5D4FF",
  Travel: "#B9E6FF",
  Entertainment: "#FFD2DF",
  Bills: "#D8DDE6",
  Medical: "#C7F0E3",
  Fuel: "#FFE6A7",
  Others: "#DDE3EC",
};

function money(amount: number) {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)}`;
}

function dateLabel(date: string) {
  const value = new Date(date);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (value.toDateString() === today.toDateString()) return "Today";
  if (value.toDateString() === yesterday.toDateString()) return "Yesterday";
  return value.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function Index() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [person, setPerson] = useState("Alone");
  const [tag, setTag] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [defaultPerson, setDefaultPersonState] = useState("Alone");
  const [managerOpen, setManagerOpen] = useState(false);
  const [managedList, setManagedList] = useState<ManagedList>("categories");
  const [entryName, setEntryName] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nativeTransactionId, setNativeTransactionId] = useState<string | null>(
    null,
  );
  const [smsPermissionGranted, setSmsPermissionGranted] = useState(false);
  const [overlayPermissionGranted, setOverlayPermissionGranted] =
    useState(false);
  const [trackingDiagnostics, setTrackingDiagnostics] =
    useState<TrackingDiagnostics | null>(null);

  const openNativePayment = useCallback(
    (transaction: PaymentTransaction) => {
      setMerchant(transaction.merchant);
      setAmount(String(transaction.amount));
      setCategory(
        categories.includes(transaction.category)
          ? transaction.category
          : (categories[0] ?? "Others"),
      );
      setPerson(
        people.includes(defaultPerson) ? defaultPerson : (people[0] ?? "Alone"),
      );
      setTag("");
      setShowDetails(false);
      setNativeTransactionId(transaction.id);
      setCaptureOpen(true);
    },
    [categories, people, defaultPerson],
  );
  const nativePaymentHandler = useRef(openNativePayment);
  nativePaymentHandler.current = openNativePayment;

  const importOverlaySavedTransactions = useCallback(() => {
    const saved = TrackoSms.getOverlaySavedTransactions();
    if (saved.length === 0) return false;
    saved.forEach((transaction) => {
      saveExpense({
        merchant: transaction.merchant,
        amount: transaction.amount,
        category: transaction.category,
        person: getDefaultPerson(),
        tag: null,
        occurredAt: transaction.occurredAt,
        source: "sms",
      });
      TrackoSms.markTransactionImported(transaction.id);
    });
    setExpenses(getExpenses());
    return true;
  }, []);

  const consumeNativeLaunch = useCallback(() => {
    const launchTransaction = TrackoSms.consumeLaunchTransaction();
    if (launchTransaction) {
      nativePaymentHandler.current(launchTransaction);
      return true;
    }
    return false;
  }, []);

  const refreshTrackingDiagnostics = useCallback(() => {
    if (process.env.EXPO_OS !== "android") return;
    try {
      setTrackingDiagnostics(TrackoSms.getTrackingDiagnostics());
    } catch {
      setTrackingDiagnostics(null);
    }
  }, []);

  const syncNativeTrackingState = useCallback(
    (includePendingFallback: boolean) => {
      importOverlaySavedTransactions();
      const handledLaunch = consumeNativeLaunch();
      if (includePendingFallback && !handledLaunch) {
        const pending = TrackoSms.getPendingTransactions();
        if (pending[0]) nativePaymentHandler.current(pending[0]);
      }
      setOverlayPermissionGranted(TrackoSms.getOverlayPermissionStatus());
      refreshTrackingDiagnostics();
      if (process.env.EXPO_OS === "android") {
        PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        ).then(setSmsPermissionGranted);
      }
    },
    [
      consumeNativeLaunch,
      importOverlaySavedTransactions,
      refreshTrackingDiagnostics,
    ],
  );

  useEffect(() => {
    initializeDatabase();
    setExpenses(getExpenses());
    setCategories(getManagedList("categories"));
    setPeople(getManagedList("people"));
    setDefaultPersonState(getDefaultPerson());
    syncNativeTrackingState(true);
  }, [syncNativeTrackingState]);

  useEffect(() => {
    const subscription = TrackoSms.addListener(
      "onPaymentReceived",
      (transaction) => nativePaymentHandler.current(transaction),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (process.env.EXPO_OS !== "android") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") syncNativeTrackingState(false);
    });
    return () => subscription.remove();
  }, [syncNativeTrackingState]);

  const totals = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const startOfWeek = startOfToday - ((now.getDay() + 6) % 7) * 86_400_000;
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).getTime();
    return expenses.reduce(
      (result, expense) => {
        const occurredAt = new Date(expense.occurredAt).getTime();
        if (occurredAt >= startOfToday) result.today += expense.amount;
        if (occurredAt >= startOfWeek) result.week += expense.amount;
        if (occurredAt >= startOfMonth) result.month += expense.amount;
        return result;
      },
      { today: 0, week: 0, month: 0 },
    );
  }, [expenses]);

  const categoryTotals = useMemo(() => {
    const values = new Map<string, number>();
    expenses.forEach((expense) =>
      values.set(
        expense.category,
        (values.get(expense.category) ?? 0) + expense.amount,
      ),
    );
    return [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [expenses]);

  function openCapture() {
    setMerchant("");
    setAmount("");
    setCategory(categories[0] ?? "Others");
    setPerson(
      people.includes(defaultPerson) ? defaultPerson : (people[0] ?? "Alone"),
    );
    setTag("");
    setShowDetails(false);
    setNativeTransactionId(null);
    setCaptureOpen(true);
  }

  async function enableTracking() {
    if (process.env.EXPO_OS !== "android") return;
    const sms = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    );
    if (sms !== PermissionsAndroid.RESULTS.GRANTED) {
      Alert.alert(
        "SMS permission is needed",
        "Tracko only reads new payment alerts to create an expense prompt.",
      );
      return;
    }
    setSmsPermissionGranted(true);
    const notificationPermission =
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (notificationPermission)
      await PermissionsAndroid.request(notificationPermission);
    if (!TrackoSms.getOverlayPermissionStatus())
      TrackoSms.openOverlaySettings();
    else setOverlayPermissionGranted(true);
  }

  function handleSave() {
    const parsedAmount = Number(amount.replace(/,/g, ""));
    if (
      !merchant.trim() ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      Alert.alert(
        "Add merchant and amount",
        "Both are needed to record an expense.",
      );
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
    saveExpense({
      merchant: merchant.trim(),
      amount: parsedAmount,
      category,
      person,
      tag: tag.trim() || null,
      occurredAt: new Date().toISOString(),
      source: nativeTransactionId ? "sms" : "manual",
    });
    setDefaultPerson(person);
    setDefaultPersonState(person);
    if (nativeTransactionId)
      TrackoSms.markTransactionImported(nativeTransactionId);
    setExpenses(getExpenses());
    setCaptureOpen(false);
  }

  function handleDelete(expense: Expense) {
    Alert.alert(
      "Delete expense?",
      `${money(expense.amount)} at ${expense.merchant} will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            removeExpense(expense.id);
            setExpenses(getExpenses());
          },
        },
      ],
    );
  }

  const activeItems = managedList === "categories" ? categories : people;

  function updateManagedItems(items: string[]) {
    persistManagedList(managedList, items);
    if (managedList === "categories") setCategories(items);
    else setPeople(items);
  }

  function saveManagedItem() {
    const next = entryName.trim();
    if (!next) return;
    if (
      activeItems.some(
        (item) =>
          item.toLocaleLowerCase() === next.toLocaleLowerCase() &&
          item !== editingName,
      )
    ) {
      Alert.alert(
        "Already exists",
        `A ${managedList === "categories" ? "category" : "person"} with that name is already available.`,
      );
      return;
    }
    if (editingName) {
      updateManagedItems(
        activeItems.map((item) => (item === editingName ? next : item)),
      );
      renameManagedValue(managedList, editingName, next);
      if (managedList === "people" && defaultPerson === editingName) {
        setDefaultPerson(next);
        setDefaultPersonState(next);
      }
      setExpenses(getExpenses());
    } else {
      updateManagedItems([...activeItems, next]);
    }
    setEntryName("");
    setEditingName(null);
  }

  function removeManagedItem(item: string) {
    if (activeItems.length === 1) {
      Alert.alert(
        "Keep one option",
        `At least one ${managedList === "categories" ? "category" : "person"} is needed.`,
      );
      return;
    }
    const usage = managedValueUsage(managedList, item);
    if (usage > 0) {
      Alert.alert(
        "Used by existing expenses",
        `Rename ${item} instead, or update the ${usage} expense${usage === 1 ? "" : "s"} that use it before deleting.`,
      );
      return;
    }
    Alert.alert(`Delete ${item}?`, "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          const items = activeItems.filter((value) => value !== item);
          updateManagedItems(items);
          if (managedList === "people" && defaultPerson === item) {
            setDefaultPerson(items[0]);
            setDefaultPersonState(items[0]);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <StatusBar style="dark" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>MONDAY, 20 JULY</Text>
            <Text style={styles.title}>Your spending</Text>
          </View>
          <View style={styles.localBadge}>
            <Text style={styles.localBadgeText}>ON DEVICE</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>SPENT TODAY</Text>
          <Text style={styles.heroAmount} selectable>
            {money(totals.today)}
          </Text>
          <View style={styles.heroDivider} />
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>THIS WEEK</Text>
              <Text style={styles.summaryAmount}>{money(totals.week)}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>THIS MONTH</Text>
              <Text style={styles.summaryAmount}>{money(totals.month)}</Text>
            </View>
            <View style={styles.streak}>
              <Text style={styles.streakText}>🔥 4 days</Text>
            </View>
          </View>
        </View>

        {(!smsPermissionGranted || !overlayPermissionGranted) && (
          <Pressable onPress={enableTracking} style={styles.setupCard}>
            <View>
              <Text style={styles.setupTitle}>Turn on automatic tracking</Text>
              <Text style={styles.setupText}>
                Allow payment SMS and popup access. Everything stays on this
                phone. Use a development build, not Expo Go.
              </Text>
            </View>
            <Text style={styles.setupAction}>Set up ›</Text>
          </Pressable>
        )}

        {process.env.EXPO_OS === "android" &&
          smsPermissionGranted &&
          overlayPermissionGranted && (
            <View style={styles.debugCard}>
              <Text style={styles.debugTitle}>SMS tracking active</Text>
              <Text style={styles.debugText}>
                Send a real SMS (not chat/RCS) like:{"\n"}
                Rs.250 debited from A/c XX1234 to SWIGGY via UPI
              </Text>
              {trackingDiagnostics?.lastSms ? (
                <>
                  <Text style={styles.debugMeta}>
                    Last SMS: {trackingDiagnostics.lastSms.status}
                    {trackingDiagnostics.lastSms.parsed
                      ? ` · ₹${trackingDiagnostics.lastSms.amount} at ${trackingDiagnostics.lastSms.merchant}`
                      : ""}
                  </Text>
                  <Text style={styles.debugBody} numberOfLines={3}>
                    {trackingDiagnostics.lastSms.body}
                  </Text>
                </>
              ) : (
                <Text style={styles.debugMeta}>
                  No payment SMS received yet on this device.
                </Text>
              )}
              <Pressable
                onPress={refreshTrackingDiagnostics}
                style={styles.debugRefresh}
              >
                <Text style={styles.debugRefreshText}>Refresh status</Text>
              </Pressable>
            </View>
          )}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Where it went</Text>
          <Text style={styles.sectionHint}>This month</Text>
        </View>
        <View style={styles.categoryCard}>
          {categoryTotals.length === 0 ? (
            <Text style={styles.muted}>Your categories will appear here.</Text>
          ) : (
            categoryTotals.map(([name, total]) => (
              <View style={styles.categoryRow} key={name}>
                <View
                  style={[
                    styles.categoryDot,
                    { backgroundColor: categoryColors[name] ?? "#DDE3EC" },
                  ]}
                />
                <Text style={styles.categoryName}>{name}</Text>
                <Text style={styles.categoryAmount}>{money(total)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <Text style={styles.sectionHint}>{expenses.length} expenses</Text>
        </View>
        <View style={styles.timeline}>
          {expenses.map((expense) => (
            <Pressable
              key={expense.id}
              onLongPress={() => handleDelete(expense)}
              style={styles.expenseRow}
            >
              <View
                style={[
                  styles.merchantMark,
                  {
                    backgroundColor:
                      categoryColors[expense.category] ?? "#DDE3EC",
                  },
                ]}
              >
                <Text style={styles.merchantMarkText}>
                  {expense.merchant.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.expenseInfo}>
                <Text style={styles.merchant} selectable>
                  {expense.merchant}
                </Text>
                <Text style={styles.expenseMeta}>
                  {expense.category} · {dateLabel(expense.occurredAt)} ·{" "}
                  {new Date(expense.occurredAt).toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <Text style={styles.expenseAmount} selectable>
                {money(expense.amount)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => {
            setManagedList("categories");
            setEntryName("");
            setEditingName(null);
            setManagerOpen(true);
          }}
          style={styles.manageButton}
        >
          <Text style={styles.manageButtonText}>
            Manage categories & people
          </Text>
          <Text style={styles.manageChevron}>›</Text>
        </Pressable>
        <Text style={styles.privacyNote}>
          Tracko keeps your expenses on this phone. No account, cloud sync, ads,
          or analytics.
        </Text>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        onPress={openCapture}
        style={styles.fab}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>

      <Modal
        visible={captureOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCaptureOpen(false)}
      >
        <SafeAreaView style={styles.modalScreen} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setCaptureOpen(false)}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>New expense</Text>
            <Pressable onPress={handleSave}>
              <Text style={styles.save}>Save</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.formIntro}>Capture it in a few taps.</Text>
            <Text style={styles.fieldLabel}>MERCHANT</Text>
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              placeholder="e.g. Swiggy"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              autoFocus
            />
            <Text style={styles.fieldLabel}>AMOUNT</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor="#9CA3AF"
              style={styles.amountInput}
              keyboardType="decimal-pad"
            />
            <Text style={styles.fieldLabel}>CATEGORY</Text>
            <View style={styles.chips}>
              {categories.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setCategory(item)}
                  style={[
                    styles.chip,
                    category === item && styles.chipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      category === item && styles.chipTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => setShowDetails(!showDetails)}
              style={styles.advancedToggle}
            >
              <Text style={styles.advancedText}>
                {showDetails ? "− Hide details" : "+ Add people or a tag"}
              </Text>
            </Pressable>
            {showDetails && (
              <View style={styles.advancedFields}>
                <Text style={styles.fieldLabel}>PEOPLE</Text>
                <View style={styles.chips}>
                  {people.map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => setPerson(item)}
                      style={[
                        styles.chip,
                        person === item && styles.chipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          person === item && styles.chipTextSelected,
                        ]}
                      >
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>TAG (OPTIONAL)</Text>
                <TextInput
                  value={tag}
                  onChangeText={setTag}
                  placeholder="Home, Office, Goa Trip…"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                />
              </View>
            )}
            <Text style={styles.helper}>
              Manual expenses stay on-device. When Android SMS tracking is
              connected, it will use this same local ledger.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={managerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setManagerOpen(false)}
      >
        <SafeAreaView style={styles.modalScreen} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setManagerOpen(false)}>
              <Text style={styles.cancel}>Done</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Preferences</Text>
            <View style={styles.headerSpacer} />
          </View>
          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.formIntro}>
              Make Tracko fit your everyday life.
            </Text>
            <View style={styles.segmentedControl}>
              {(["categories", "people"] as ManagedList[]).map((list) => (
                <Pressable
                  key={list}
                  onPress={() => {
                    setManagedList(list);
                    setEntryName("");
                    setEditingName(null);
                  }}
                  style={[
                    styles.segment,
                    managedList === list && styles.segmentSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      managedList === list && styles.segmentTextSelected,
                    ]}
                  >
                    {list === "categories" ? "Categories" : "People"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>
              {editingName
                ? `RENAME ${editingName.toUpperCase()}`
                : `ADD ${managedList === "categories" ? "CATEGORY" : "PERSON"}`}
            </Text>
            <View style={styles.addRow}>
              <TextInput
                value={entryName}
                onChangeText={setEntryName}
                placeholder={
                  managedList === "categories"
                    ? "e.g. Education"
                    : "e.g. Roommates"
                }
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.addInput]}
                autoFocus={editingName !== null}
              />
              <Pressable onPress={saveManagedItem} style={styles.addButton}>
                <Text style={styles.addButtonText}>
                  {editingName ? "Save" : "Add"}
                </Text>
              </Pressable>
            </View>
            {editingName && (
              <Pressable
                onPress={() => {
                  setEditingName(null);
                  setEntryName("");
                }}
              >
                <Text style={styles.cancelEdit}>Cancel rename</Text>
              </Pressable>
            )}
            <Text style={styles.fieldLabel}>
              {managedList === "categories" ? "YOUR CATEGORIES" : "YOUR PEOPLE"}
            </Text>
            <View style={styles.manageList}>
              {activeItems.map((item) => (
                <View key={item} style={styles.manageRow}>
                  <Text style={styles.manageName}>{item}</Text>
                  <Pressable
                    onPress={() => {
                      setEditingName(item);
                      setEntryName(item);
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.rename}>Rename</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeManagedItem(item)}
                    hitSlop={8}
                  >
                    <Text style={styles.delete}>Delete</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <Text style={styles.helper}>
              Renaming updates existing expenses. To protect your history, an
              option in use cannot be deleted.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F8F5" },
  content: { padding: 20, paddingBottom: 110, gap: 20 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: "#777A73",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  title: {
    color: "#1D2520",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -1.1,
    marginTop: 4,
  },
  localBadge: {
    borderWidth: 1,
    borderColor: "#C7D6C8",
    backgroundColor: "#EDF6EE",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginTop: 4,
  },
  localBadgeText: {
    color: "#357048",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  heroCard: {
    backgroundColor: "#193D2A",
    borderRadius: 28,
    padding: 24,
    gap: 13,
  },
  heroLabel: {
    color: "#BCD8C4",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  heroAmount: {
    color: "#FFFFFF",
    fontSize: 46,
    fontWeight: "700",
    letterSpacing: -1.7,
    fontVariant: ["tabular-nums"],
  },
  heroDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.14)" },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  summaryLabel: {
    color: "#A9C4B0",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  summaryAmount: {
    color: "#F8FFFA",
    fontSize: 17,
    fontWeight: "700",
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  streak: {
    backgroundColor: "#2C5B40",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  streakText: { color: "#F9E9C0", fontSize: 12, fontWeight: "700" },
  setupCard: {
    backgroundColor: "#EDF6EE",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: "#C9DDCB",
  },
  setupTitle: {
    color: "#214E31",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 3,
  },
  setupText: { color: "#52715B", fontSize: 12, lineHeight: 17, flexShrink: 1 },
  setupAction: { color: "#1D6D40", fontSize: 14, fontWeight: "800" },
  debugCard: {
    backgroundColor: "#F8FAF7",
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E2E8DE",
  },
  debugTitle: {
    color: "#1D2520",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 6,
  },
  debugText: {
    color: "#5A695E",
    fontSize: 13,
    lineHeight: 19,
  },
  debugMeta: {
    color: "#1D6D40",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 10,
  },
  debugBody: {
    color: "#777A73",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  debugRefresh: {
    alignSelf: "flex-start",
    marginTop: 10,
  },
  debugRefreshText: {
    color: "#1D6D40",
    fontSize: 13,
    fontWeight: "600",
  },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 4,
  },
  sectionTitle: {
    color: "#1D2520",
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  sectionHint: { color: "#777A73", fontSize: 13 },
  categoryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    gap: 15,
    boxShadow: "0 1px 3px rgba(32, 42, 35, 0.07)",
  },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  categoryDot: { width: 10, height: 10, borderRadius: 5 },
  categoryName: { color: "#323A34", fontSize: 15, flex: 1 },
  categoryAmount: {
    color: "#1D2520",
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  muted: { color: "#777A73", fontSize: 14 },
  timeline: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(32, 42, 35, 0.07)",
  },
  expenseRow: {
    minHeight: 76,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E6E9E5",
  },
  merchantMark: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  merchantMarkText: { color: "#27352C", fontSize: 16, fontWeight: "800" },
  expenseInfo: { flex: 1, gap: 3 },
  merchant: { color: "#202821", fontSize: 15, fontWeight: "700" },
  expenseMeta: { color: "#777A73", fontSize: 12 },
  expenseAmount: {
    color: "#202821",
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  privacyNote: {
    color: "#777A73",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 18,
  },
  manageButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 1px 3px rgba(32, 42, 35, 0.07)",
  },
  manageButtonText: { color: "#1D6D40", fontSize: 15, fontWeight: "700" },
  manageChevron: { color: "#1D6D40", fontSize: 24, lineHeight: 24 },
  fab: {
    position: "absolute",
    right: 23,
    bottom: 28,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "#1D6D40",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 16px rgba(25, 61, 42, 0.28)",
  },
  fabText: { color: "#FFFFFF", fontSize: 32, fontWeight: "300", marginTop: -3 },
  modalScreen: { flex: 1, backgroundColor: "#F8F8F5" },
  modalHeader: {
    height: 56,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E0E4DF",
  },
  headerSpacer: { width: 38 },
  cancel: { color: "#566058", fontSize: 16 },
  modalTitle: { color: "#1D2520", fontSize: 17, fontWeight: "700" },
  save: { color: "#1D6D40", fontSize: 16, fontWeight: "800" },
  form: { padding: 20, paddingBottom: 48, gap: 10 },
  formIntro: { color: "#59635B", fontSize: 16, marginBottom: 12 },
  fieldLabel: {
    color: "#687269",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 15,
    height: 52,
    fontSize: 16,
    color: "#1D2520",
    borderWidth: 1,
    borderColor: "#E1E6E0",
  },
  amountInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 15,
    height: 64,
    fontSize: 28,
    fontWeight: "700",
    color: "#1D2520",
    borderWidth: 1,
    borderColor: "#E1E6E0",
    fontVariant: ["tabular-nums"],
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "#EEF0EC",
    borderRadius: 999,
  },
  chipSelected: { backgroundColor: "#1D6D40" },
  chipText: { color: "#59635B", fontSize: 14, fontWeight: "600" },
  chipTextSelected: { color: "#FFFFFF" },
  advancedToggle: { paddingVertical: 16, marginTop: 8 },
  advancedText: { color: "#1D6D40", fontSize: 15, fontWeight: "700" },
  advancedFields: { gap: 8 },
  segmentedControl: {
    padding: 4,
    backgroundColor: "#E8ECE7",
    borderRadius: 13,
    flexDirection: "row",
  },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  segmentSelected: {
    backgroundColor: "#FFFFFF",
    boxShadow: "0 1px 2px rgba(32, 42, 35, 0.12)",
  },
  segmentText: { color: "#687269", fontWeight: "700", fontSize: 14 },
  segmentTextSelected: { color: "#1D2520" },
  addRow: { flexDirection: "row", gap: 8 },
  addInput: { flex: 1 },
  addButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: "#1D6D40",
    borderRadius: 14,
  },
  addButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  cancelEdit: {
    color: "#687269",
    fontSize: 14,
    fontWeight: "600",
    paddingTop: 4,
  },
  manageList: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 2,
  },
  manageRow: {
    minHeight: 56,
    alignItems: "center",
    flexDirection: "row",
    gap: 15,
    paddingHorizontal: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E6E9E5",
  },
  manageName: { color: "#202821", fontSize: 16, fontWeight: "600", flex: 1 },
  rename: { color: "#1D6D40", fontWeight: "700", fontSize: 13 },
  delete: { color: "#BF3D3D", fontWeight: "700", fontSize: 13 },
  helper: { color: "#7A837B", fontSize: 12, lineHeight: 18, marginTop: 18 },
});

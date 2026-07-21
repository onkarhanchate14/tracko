import * as Haptics from "expo-haptics";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

import type { TrackingDiagnostics } from "@/modules/tracko-sms";
import TrackoSms, { PaymentTransaction } from "@/modules/tracko-sms";

import {
  Expense,
  getDefaultPerson,
  getExpenses,
  getLearnedCategory,
  getManagedList,
  getMerchantCategoryMap,
  getPreference,
  initializeDatabase,
  ManagedList,
  removeExpense,
  renameManagedValue as renameManagedValueDb,
  saveExpense,
  setDefaultPerson,
  setManagedList,
  setPreference,
  updateExpense,
} from "@/lib/database";
import { palette } from "@/lib/theme";

const ONBOARDING_KEY = "tracko.tracking-requested";

type SmsSource = {
  transactionId: string;
  bank: string | null;
  rawBody: string | null;
  occurredAt: string;
};

type AppContextValue = {
  expenses: Expense[];
  categories: string[];
  people: string[];
  defaultPerson: string;
  smsPermissionGranted: boolean;
  overlayPermissionGranted: boolean;
  trackingDiagnostics: TrackingDiagnostics | null;
  isAndroid: boolean;
  refreshExpenses: () => void;
  refreshTrackingDiagnostics: () => void;
  openCaptureNew: () => void;
  openCaptureForExpense: (expense: Expense) => void;
  deleteExpense: (expense: Expense) => void;
  saveCategoriesList: (items: string[]) => void;
  savePeopleList: (items: string[]) => void;
  renameManaged: (list: ManagedList, previous: string, next: string) => void;
  setDefaultPersonPref: (person: string) => void;
  enableTracking: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used within AppProvider");
  return value;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const isAndroid = process.env.EXPO_OS === "android";

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [defaultPerson, setDefaultPersonState] = useState("Alone");
  const [smsPermissionGranted, setSmsPermissionGranted] = useState(false);
  const [overlayPermissionGranted, setOverlayPermissionGranted] =
    useState(false);
  const [trackingDiagnostics, setTrackingDiagnostics] =
    useState<TrackingDiagnostics | null>(null);

  // Capture modal state.
  const [captureOpen, setCaptureOpen] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [person, setPerson] = useState("Alone");
  const [tag, setTag] = useState("");
  const [note, setNote] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [smsSource, setSmsSource] = useState<SmsSource | null>(null);

  const captureOpenRef = useRef(captureOpen);
  captureOpenRef.current = captureOpen;

  const syncOverlayConfig = useCallback(() => {
    if (!isAndroid) return;
    try {
      TrackoSms.setOverlayConfig({
        categories: getManagedList("categories"),
        people: getManagedList("people"),
        defaultPerson: getDefaultPerson(),
        merchantCategories: getMerchantCategoryMap(),
      });
    } catch {
      // Native module may be unavailable (e.g. Expo Go); ignore.
    }
  }, [isAndroid]);

  const refreshExpenses = useCallback(() => {
    setExpenses(getExpenses());
  }, []);

  const refreshTrackingDiagnostics = useCallback(() => {
    if (!isAndroid) return;
    try {
      setTrackingDiagnostics(TrackoSms.getTrackingDiagnostics());
    } catch {
      setTrackingDiagnostics(null);
    }
  }, [isAndroid]);

  const openNativePayment = useCallback((transaction: PaymentTransaction) => {
    const currentCategories = getManagedList("categories");
    const currentPeople = getManagedList("people");
    const learned = getLearnedCategory(transaction.merchant);
    const resolvedCategory =
      learned ??
      (currentCategories.includes(transaction.category)
        ? transaction.category
        : (currentCategories[0] ?? "Others"));
    const preferredPerson = transaction.person ?? getDefaultPerson();

    setMerchant(transaction.merchant);
    setAmount(String(transaction.amount));
    setCategory(resolvedCategory);
    setPerson(
      currentPeople.includes(preferredPerson)
        ? preferredPerson
        : (currentPeople[0] ?? "Alone"),
    );
    setTag("");
    setNote("");
    setShowDetails(false);
    setEditingExpense(null);
    setSmsSource({
      transactionId: transaction.id,
      bank: transaction.bank ?? null,
      rawBody: transaction.rawBody ?? null,
      occurredAt: transaction.occurredAt,
    });
    setCaptureOpen(true);
  }, []);
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
        person: transaction.person ?? getDefaultPerson(),
        tag: null,
        note: null,
        bank: transaction.bank ?? null,
        rawBody: transaction.rawBody ?? null,
        occurredAt: transaction.occurredAt,
        source: "sms",
      });
      TrackoSms.markTransactionImported(transaction.id);
    });
    refreshExpenses();
    syncOverlayConfig();
    return true;
  }, [refreshExpenses, syncOverlayConfig]);

  const consumeNativeLaunch = useCallback(() => {
    const launchTransaction = TrackoSms.consumeLaunchTransaction();
    if (launchTransaction) {
      nativePaymentHandler.current(launchTransaction);
      return true;
    }
    return false;
  }, []);

  const syncNativeTrackingState = useCallback(
    (includePendingFallback: boolean) => {
      if (!isAndroid) return;
      importOverlaySavedTransactions();
      const handledLaunch = consumeNativeLaunch();
      if (includePendingFallback && !handledLaunch && !captureOpenRef.current) {
        const pending = TrackoSms.getPendingTransactions();
        if (pending[0]) nativePaymentHandler.current(pending[0]);
      }
      setOverlayPermissionGranted(TrackoSms.getOverlayPermissionStatus());
      refreshTrackingDiagnostics();
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS).then(
        setSmsPermissionGranted,
      );
    },
    [
      isAndroid,
      consumeNativeLaunch,
      importOverlaySavedTransactions,
      refreshTrackingDiagnostics,
    ],
  );

  const enableTracking = useCallback(async () => {
    if (!isAndroid) return;
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
    if (!TrackoSms.getOverlayPermissionStatus()) {
      TrackoSms.openOverlaySettings();
    } else {
      setOverlayPermissionGranted(true);
    }
  }, [isAndroid]);

  // Initial load.
  useEffect(() => {
    initializeDatabase();
    setExpenses(getExpenses());
    setCategories(getManagedList("categories"));
    setPeople(getManagedList("people"));
    setDefaultPersonState(getDefaultPerson());
    syncOverlayConfig();
    syncNativeTrackingState(true);
  }, [syncNativeTrackingState, syncOverlayConfig]);

  // Auto-request tracking permission on first launch.
  useEffect(() => {
    if (!isAndroid) return;
    if (getPreference(ONBOARDING_KEY)) return;
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS).then(
      (granted) => {
        if (!granted) {
          setPreference(ONBOARDING_KEY, "1");
          enableTracking();
        }
      },
    );
  }, [isAndroid, enableTracking]);

  useEffect(() => {
    const subscription = TrackoSms.addListener(
      "onPaymentReceived",
      (transaction) => {
        nativePaymentHandler.current(transaction);
        refreshTrackingDiagnostics();
      },
    );
    return () => subscription.remove();
  }, [refreshTrackingDiagnostics]);

  useEffect(() => {
    if (!isAndroid) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") syncNativeTrackingState(true);
    });
    return () => subscription.remove();
  }, [isAndroid, syncNativeTrackingState]);

  useEffect(() => {
    if (!isAndroid || !smsPermissionGranted) return;
    const interval = setInterval(refreshTrackingDiagnostics, 3000);
    return () => clearInterval(interval);
  }, [isAndroid, smsPermissionGranted, refreshTrackingDiagnostics]);

  const openCaptureNew = useCallback(() => {
    const currentCategories = getManagedList("categories");
    const currentPeople = getManagedList("people");
    const pref = getDefaultPerson();
    setMerchant("");
    setAmount("");
    setCategory(currentCategories[0] ?? "Others");
    setPerson(
      currentPeople.includes(pref) ? pref : (currentPeople[0] ?? "Alone"),
    );
    setTag("");
    setNote("");
    setShowDetails(false);
    setEditingExpense(null);
    setSmsSource(null);
    setCaptureOpen(true);
  }, []);

  const openCaptureForExpense = useCallback((expense: Expense) => {
    setMerchant(expense.merchant);
    setAmount(String(expense.amount));
    setCategory(expense.category);
    setPerson(expense.person);
    setTag(expense.tag ?? "");
    setNote(expense.note ?? "");
    setShowDetails(Boolean(expense.tag || expense.note));
    setEditingExpense(expense);
    setSmsSource(null);
    setCaptureOpen(true);
  }, []);

  const handleSaveCapture = useCallback(() => {
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
    const trimmedTag = tag.trim() || null;
    const trimmedNote = note.trim() || null;

    if (editingExpense) {
      updateExpense(editingExpense.id, {
        merchant: merchant.trim(),
        amount: parsedAmount,
        category,
        person,
        tag: trimmedTag,
        note: trimmedNote,
        occurredAt: editingExpense.occurredAt,
      });
    } else {
      saveExpense({
        merchant: merchant.trim(),
        amount: parsedAmount,
        category,
        person,
        tag: trimmedTag,
        note: trimmedNote,
        bank: smsSource?.bank ?? null,
        rawBody: smsSource?.rawBody ?? null,
        occurredAt: smsSource?.occurredAt ?? new Date().toISOString(),
        source: smsSource ? "sms" : "manual",
      });
      if (smsSource) TrackoSms.markTransactionImported(smsSource.transactionId);
    }

    setDefaultPerson(person);
    setDefaultPersonState(person);
    refreshExpenses();
    syncOverlayConfig();
    setCaptureOpen(false);
  }, [
    amount,
    merchant,
    category,
    person,
    tag,
    note,
    editingExpense,
    smsSource,
    refreshExpenses,
    syncOverlayConfig,
  ]);

  const deleteExpense = useCallback(
    (expense: Expense) => {
      Alert.alert(
        "Delete expense?",
        `₹${Math.round(expense.amount)} at ${expense.merchant} will be removed.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              removeExpense(expense.id);
              refreshExpenses();
            },
          },
        ],
      );
    },
    [refreshExpenses],
  );

  const saveCategoriesList = useCallback(
    (items: string[]) => {
      setManagedList("categories", items);
      setCategories(items);
      syncOverlayConfig();
    },
    [syncOverlayConfig],
  );

  const savePeopleList = useCallback(
    (items: string[]) => {
      setManagedList("people", items);
      setPeople(items);
      syncOverlayConfig();
    },
    [syncOverlayConfig],
  );

  const renameManaged = useCallback(
    (list: ManagedList, previous: string, next: string) => {
      renameManagedValueDb(list, previous, next);
      refreshExpenses();
      syncOverlayConfig();
    },
    [refreshExpenses, syncOverlayConfig],
  );

  const setDefaultPersonPref = useCallback((nextPerson: string) => {
    setDefaultPerson(nextPerson);
    setDefaultPersonState(nextPerson);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      expenses,
      categories,
      people,
      defaultPerson,
      smsPermissionGranted,
      overlayPermissionGranted,
      trackingDiagnostics,
      isAndroid,
      refreshExpenses,
      refreshTrackingDiagnostics,
      openCaptureNew,
      openCaptureForExpense,
      deleteExpense,
      saveCategoriesList,
      savePeopleList,
      renameManaged,
      setDefaultPersonPref,
      enableTracking,
    }),
    [
      expenses,
      categories,
      people,
      defaultPerson,
      smsPermissionGranted,
      overlayPermissionGranted,
      trackingDiagnostics,
      isAndroid,
      refreshExpenses,
      refreshTrackingDiagnostics,
      openCaptureNew,
      openCaptureForExpense,
      deleteExpense,
      saveCategoriesList,
      savePeopleList,
      renameManaged,
      setDefaultPersonPref,
      enableTracking,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
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
            <Text style={styles.modalTitle}>
              {editingExpense ? "Edit expense" : "New expense"}
            </Text>
            <Pressable onPress={handleSaveCapture}>
              <Text style={styles.save}>Save</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            {smsSource ? (
              <View style={styles.smsBadge}>
                <Text style={styles.smsBadgeText}>Auto-filled from SMS</Text>
              </View>
            ) : null}
            <Text style={styles.fieldLabel}>MERCHANT</Text>
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              placeholder="e.g. Swiggy"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
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
                {showDetails ? "− Hide details" : "+ Add people, tag or a note"}
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
                <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Anything worth remembering…"
                  placeholderTextColor="#9CA3AF"
                  style={[styles.input, styles.noteInput]}
                  multiline
                />
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </AppContext.Provider>
  );
}

const styles = StyleSheet.create({
  modalScreen: { flex: 1, backgroundColor: palette.background },
  modalHeader: {
    height: 56,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E0E4DF",
  },
  cancel: { color: "#566058", fontSize: 16 },
  modalTitle: { color: palette.ink, fontSize: 17, fontWeight: "700" },
  save: { color: palette.brand, fontSize: 16, fontWeight: "800" },
  form: { padding: 20, paddingBottom: 48, gap: 10 },
  smsBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#EDF6EE",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#C9DDCB",
    marginBottom: 6,
  },
  smsBadgeText: { color: "#1D6D40", fontSize: 12, fontWeight: "800" },
  fieldLabel: {
    color: "#687269",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 12,
  },
  input: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    paddingHorizontal: 15,
    height: 52,
    fontSize: 16,
    color: palette.ink,
    borderWidth: 1,
    borderColor: "#E1E6E0",
  },
  noteInput: { height: 88, paddingTop: 14, textAlignVertical: "top" },
  amountInput: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    paddingHorizontal: 15,
    height: 64,
    fontSize: 28,
    fontWeight: "700",
    color: palette.ink,
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
  chipSelected: { backgroundColor: palette.brand },
  chipText: { color: "#59635B", fontSize: 14, fontWeight: "600" },
  chipTextSelected: { color: "#FFFFFF" },
  advancedToggle: { paddingVertical: 16, marginTop: 8 },
  advancedText: { color: palette.brand, fontSize: 15, fontWeight: "700" },
  advancedFields: { gap: 8 },
});

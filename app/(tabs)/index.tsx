import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Expense } from "@/lib/database";
import { useApp } from "@/lib/store";
import {
  colorForCategory,
  dateLabel,
  fullDateLabel,
  money,
  palette,
  timeLabel,
} from "@/lib/theme";

export default function HomeScreen() {
  const {
    expenses,
    smsPermissionGranted,
    overlayPermissionGranted,
    isAndroid,
    openCaptureNew,
    openCaptureForExpense,
    deleteExpense,
    enableTracking,
  } = useApp();

  const [detail, setDetail] = useState<Expense | null>(null);

  const todayHeading = new Date()
    .toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
    .toUpperCase();

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
    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).getTime();
    const values = new Map<string, number>();
    expenses
      .filter((e) => new Date(e.occurredAt).getTime() >= startOfMonth)
      .forEach((expense) =>
        values.set(
          expense.category,
          (values.get(expense.category) ?? 0) + expense.amount,
        ),
      );
    return [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [expenses]);

  const monthTotalForBars = categoryTotals.reduce((sum, [, v]) => sum + v, 0);

  const showTracking = !smsPermissionGranted || !overlayPermissionGranted;

  function onLongPressExpense(expense: Expense) {
    Alert.alert(
      expense.merchant,
      `${money(expense.amount)} · ${expense.category}`,
      [
        { text: "Edit", onPress: () => openCaptureForExpense(expense) },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteExpense(expense),
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
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
            <Text style={styles.eyebrow}>{todayHeading}</Text>
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
          </View>
        </View>

        {isAndroid && showTracking && (
          <Pressable onPress={enableTracking} style={styles.setupCard}>
            <View style={styles.setupTextWrap}>
              <Text style={styles.setupTitle}>Turn on automatic tracking</Text>
              <Text style={styles.setupText}>
                Allow payment SMS and popup access so expenses are captured for
                you. Everything stays on this phone.
              </Text>
            </View>
            <Text style={styles.setupAction}>Allow ›</Text>
          </Pressable>
        )}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Where it went</Text>
          <Text style={styles.sectionHint}>This month</Text>
        </View>
        <View style={styles.card}>
          {categoryTotals.length === 0 ? (
            <Text style={styles.muted}>Your categories will appear here.</Text>
          ) : (
            categoryTotals.map(([name, total]) => (
              <View style={styles.categoryRow} key={name}>
                <View style={styles.categoryTop}>
                  <View
                    style={[
                      styles.categoryDot,
                      { backgroundColor: colorForCategory(name) },
                    ]}
                  />
                  <Text style={styles.categoryName}>{name}</Text>
                  <Text style={styles.categoryAmount}>{money(total)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        backgroundColor: colorForCategory(name),
                        width: `${
                          monthTotalForBars > 0
                            ? (total / monthTotalForBars) * 100
                            : 0
                        }%`,
                      },
                    ]}
                  />
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <Text style={styles.sectionHint}>{expenses.length} expenses</Text>
        </View>
        {expenses.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.muted}>
              No expenses yet. Tap ＋ to add one, or let SMS tracking capture
              them automatically.
            </Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {expenses.map((expense) => (
              <Pressable
                key={expense.id}
                onPress={() => setDetail(expense)}
                onLongPress={() => onLongPressExpense(expense)}
                style={styles.expenseRow}
              >
                <View
                  style={[
                    styles.merchantMark,
                    { backgroundColor: colorForCategory(expense.category) },
                  ]}
                >
                  <Text style={styles.merchantMarkText}>
                    {expense.merchant.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.expenseInfo}>
                  <Text style={styles.merchant} numberOfLines={1}>
                    {expense.merchant}
                  </Text>
                  <Text style={styles.expenseMeta}>
                    {expense.category} · {dateLabel(expense.occurredAt)} ·{" "}
                    {timeLabel(expense.occurredAt)}
                  </Text>
                </View>
                <Text style={styles.expenseAmount}>
                  {money(expense.amount)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={styles.privacyNote}>
          Tracko keeps your expenses on this phone. No account, cloud sync, or
          ads.
        </Text>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        onPress={openCaptureNew}
        style={styles.fab}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>

      <ExpenseDetailModal
        expense={detail}
        onClose={() => setDetail(null)}
        onEdit={(expense) => {
          setDetail(null);
          openCaptureForExpense(expense);
        }}
        onDelete={(expense) => {
          setDetail(null);
          deleteExpense(expense);
        }}
      />
    </SafeAreaView>
  );
}

function ExpenseDetailModal({
  expense,
  onClose,
  onEdit,
  onDelete,
}: {
  expense: Expense | null;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}) {
  return (
    <Modal
      visible={expense !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalScreen} edges={["top", "bottom"]}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}>
            <Text style={styles.cancel}>Close</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Details</Text>
          <View style={{ width: 44 }} />
        </View>
        {expense && (
          <ScrollView contentContainerStyle={styles.detailBody}>
            <View
              style={[
                styles.detailMark,
                { backgroundColor: colorForCategory(expense.category) },
              ]}
            >
              <Text style={styles.detailMarkText}>
                {expense.merchant.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.detailAmount} selectable>
              {money(expense.amount)}
            </Text>
            <Text style={styles.detailMerchant} selectable>
              {expense.merchant}
            </Text>

            <View style={styles.detailCard}>
              <DetailRow label="Category" value={expense.category} />
              <DetailRow label="People" value={expense.person} />
              <DetailRow label="Tag" value={expense.tag ?? "—"} />
              <DetailRow
                label="Date"
                value={fullDateLabel(expense.occurredAt)}
              />
              <DetailRow label="Time" value={timeLabel(expense.occurredAt)} />
              <DetailRow
                label="Source"
                value={expense.source === "sms" ? "SMS auto-capture" : "Manual"}
              />
              {expense.bank ? (
                <DetailRow label="Sender" value={expense.bank} />
              ) : null}
              {expense.note ? (
                <DetailRow label="Note" value={expense.note} />
              ) : null}
            </View>

            {expense.rawBody ? (
              <View style={styles.rawCard}>
                <Text style={styles.rawLabel}>ORIGINAL MESSAGE</Text>
                <Text style={styles.rawText} selectable>
                  {expense.rawBody}
                </Text>
              </View>
            ) : null}

            <View style={styles.detailActions}>
              <Pressable
                style={styles.editButton}
                onPress={() => onEdit(expense)}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </Pressable>
              <Pressable
                style={styles.deleteButton}
                onPress={() => onDelete(expense)}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, paddingBottom: 120, gap: 20 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: palette.inkMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  title: {
    color: palette.ink,
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
    backgroundColor: palette.brandDark,
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
    gap: 48,
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
  setupTextWrap: { flex: 1 },
  setupTitle: {
    color: "#214E31",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 3,
  },
  setupText: { color: "#52715B", fontSize: 12, lineHeight: 17 },
  setupAction: { color: palette.brand, fontSize: 14, fontWeight: "800" },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 4,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  sectionHint: { color: palette.inkMuted, fontSize: 13 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: 16,
    gap: 15,
    boxShadow: "0 1px 3px rgba(32, 42, 35, 0.07)",
  },
  categoryRow: { gap: 8 },
  categoryTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  categoryDot: { width: 10, height: 10, borderRadius: 5 },
  categoryName: { color: "#323A34", fontSize: 15, flex: 1 },
  categoryAmount: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EEF1EC",
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: 3 },
  muted: { color: palette.inkMuted, fontSize: 14, lineHeight: 20 },
  timeline: {
    backgroundColor: palette.surface,
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
    borderBottomColor: palette.line,
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
  expenseMeta: { color: palette.inkMuted, fontSize: 12 },
  expenseAmount: {
    color: "#202821",
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  privacyNote: {
    color: palette.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 18,
  },
  fab: {
    position: "absolute",
    right: 23,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: palette.brand,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 16px rgba(25, 61, 42, 0.28)",
  },
  fabText: { color: "#FFFFFF", fontSize: 32, fontWeight: "300", marginTop: -3 },
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
  detailBody: { padding: 24, alignItems: "center", paddingBottom: 48 },
  detailMark: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  detailMarkText: { color: "#27352C", fontSize: 26, fontWeight: "800" },
  detailAmount: {
    color: palette.ink,
    fontSize: 40,
    fontWeight: "800",
    marginTop: 16,
    fontVariant: ["tabular-nums"],
  },
  detailMerchant: {
    color: palette.inkSoft,
    fontSize: 17,
    fontWeight: "600",
    marginTop: 4,
  },
  detailCard: {
    alignSelf: "stretch",
    backgroundColor: palette.surface,
    borderRadius: 18,
    paddingHorizontal: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: palette.line,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 14,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  detailRowLabel: { color: palette.inkMuted, fontSize: 14 },
  detailRowValue: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  rawCard: {
    alignSelf: "stretch",
    backgroundColor: "#F1F4EF",
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  rawLabel: {
    color: palette.inkMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 6,
  },
  rawText: { color: palette.inkSoft, fontSize: 13, lineHeight: 19 },
  detailActions: {
    flexDirection: "row",
    gap: 12,
    alignSelf: "stretch",
    marginTop: 24,
  },
  editButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: palette.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  editButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  deleteButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#FBE9E9",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: { color: palette.danger, fontSize: 15, fontWeight: "800" },
});

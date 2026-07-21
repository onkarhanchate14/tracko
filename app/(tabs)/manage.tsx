import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ManagedList, managedValueUsage } from "@/lib/database";
import { useApp } from "@/lib/store";
import { palette } from "@/lib/theme";

// ---------------------------------------------------------------------------
// DEBUG CARD: set to `false` (or delete the `<TrackingDebugCard />` usage below)
// once SMS capture is verified on-device. It only renders in development builds
// on Android and simply surfaces the last received SMS for troubleshooting.
const SHOW_DEBUG_CARD = true;
// ---------------------------------------------------------------------------

export default function ManageScreen() {
  const {
    categories,
    people,
    defaultPerson,
    smsPermissionGranted,
    overlayPermissionGranted,
    isAndroid,
    enableTracking,
    saveCategoriesList,
    savePeopleList,
    renameManaged,
    setDefaultPersonPref,
  } = useApp();

  const [managedList, setManagedList] = useState<ManagedList>("categories");
  const [entryName, setEntryName] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);

  const activeItems = managedList === "categories" ? categories : people;

  function updateManagedItems(items: string[]) {
    if (managedList === "categories") saveCategoriesList(items);
    else savePeopleList(items);
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
      renameManaged(managedList, editingName, next);
      if (managedList === "people" && defaultPerson === editingName) {
        setDefaultPersonPref(next);
      }
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
            setDefaultPersonPref(items[0]);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Manage</Text>

        {isAndroid && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Automatic SMS tracking</Text>
            <Text style={styles.cardText}>
              Tracko reads new payment SMS to pre-fill expenses and can show a
              quick popup to categorise them.
            </Text>
            <View style={styles.statusRow}>
              <StatusPill label="SMS" ok={smsPermissionGranted} />
              <StatusPill label="Popup" ok={overlayPermissionGranted} />
            </View>
            {(!smsPermissionGranted || !overlayPermissionGranted) && (
              <Pressable style={styles.primaryButton} onPress={enableTracking}>
                <Text style={styles.primaryButtonText}>Allow permissions</Text>
              </Pressable>
            )}
          </View>
        )}

        {SHOW_DEBUG_CARD && <TrackingDebugCard />}

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
              managedList === "categories" ? "e.g. Education" : "e.g. Roommates"
            }
            placeholderTextColor="#9CA3AF"
            style={[styles.input, styles.addInput]}
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

        <View style={styles.manageList}>
          {activeItems.map((item) => (
            <View key={item} style={styles.manageRow}>
              <Text style={styles.manageName}>{item}</Text>
              {managedList === "people" && item === defaultPerson ? (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => {
                  setEditingName(item);
                  setEntryName(item);
                }}
                hitSlop={8}
              >
                <Text style={styles.rename}>Rename</Text>
              </Pressable>
              <Pressable onPress={() => removeManagedItem(item)} hitSlop={8}>
                <Text style={styles.delete}>Delete</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {managedList === "people" && (
          <>
            <Text style={styles.fieldLabel}>
              DEFAULT PEOPLE FOR NEW EXPENSES
            </Text>
            <View style={styles.chips}>
              {people.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setDefaultPersonPref(item)}
                  style={[
                    styles.chip,
                    defaultPerson === item && styles.chipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      defaultPerson === item && styles.chipTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text style={styles.helper}>
          Renaming updates existing expenses. To protect your history, an option
          in use cannot be deleted.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={[styles.pill, ok ? styles.pillOn : styles.pillOff]}>
      <Text
        style={[styles.pillText, ok ? styles.pillTextOn : styles.pillTextOff]}
      >
        {label}: {ok ? "on" : "off"}
      </Text>
    </View>
  );
}

// DEBUG CARD component — safe to delete along with SHOW_DEBUG_CARD above.
function TrackingDebugCard() {
  const {
    isAndroid,
    smsPermissionGranted,
    trackingDiagnostics,
    refreshTrackingDiagnostics,
  } = useApp();
  if (!isAndroid || !smsPermissionGranted) return null;
  const last = trackingDiagnostics?.lastSms;
  return (
    <View style={styles.debugCard}>
      <Text style={styles.debugTitle}>SMS tracking active (debug)</Text>
      <Text style={styles.debugText}>
        Send a real SMS (not chat/RCS) like:{"\n"}
        Rs.250 debited from A/c XX1234 to SWIGGY via UPI
      </Text>
      {last ? (
        <>
          <Text style={styles.debugMeta}>
            Last SMS: {last.status}
            {last.parsed ? ` · ₹${last.amount} at ${last.merchant}` : ""}
          </Text>
          <Text style={styles.debugBody} numberOfLines={3}>
            {last.body}
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
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, paddingBottom: 110, gap: 14 },
  title: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -1,
    marginBottom: 4,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: 16,
    boxShadow: "0 1px 3px rgba(32, 42, 35, 0.07)",
  },
  cardTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  cardText: {
    color: palette.inkSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  statusRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  pillOn: { backgroundColor: "#EDF6EE", borderColor: "#C9DDCB" },
  pillOff: { backgroundColor: "#FBECEC", borderColor: "#EBD0D0" },
  pillText: { fontSize: 12, fontWeight: "800" },
  pillTextOn: { color: palette.brand },
  pillTextOff: { color: palette.danger },
  primaryButton: {
    marginTop: 14,
    height: 48,
    borderRadius: 14,
    backgroundColor: palette.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  debugCard: {
    backgroundColor: "#F8FAF7",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8DE",
  },
  debugTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 6,
  },
  debugText: { color: "#5A695E", fontSize: 13, lineHeight: 19 },
  debugMeta: {
    color: palette.brand,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 10,
  },
  debugBody: {
    color: palette.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  debugRefresh: { alignSelf: "flex-start", marginTop: 10 },
  debugRefreshText: { color: palette.brand, fontSize: 13, fontWeight: "600" },
  segmentedControl: {
    padding: 4,
    backgroundColor: "#E8ECE7",
    borderRadius: 13,
    flexDirection: "row",
    marginTop: 6,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  segmentSelected: {
    backgroundColor: palette.surface,
    boxShadow: "0 1px 2px rgba(32, 42, 35, 0.12)",
  },
  segmentText: { color: "#687269", fontWeight: "700", fontSize: 14 },
  segmentTextSelected: { color: palette.ink },
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
  addRow: { flexDirection: "row", gap: 8 },
  addInput: { flex: 1 },
  addButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: palette.brand,
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
    backgroundColor: palette.surface,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 6,
  },
  manageRow: {
    minHeight: 56,
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  manageName: { color: "#202821", fontSize: 16, fontWeight: "600", flex: 1 },
  defaultBadge: {
    backgroundColor: "#EDF6EE",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  defaultBadgeText: {
    color: palette.brand,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  rename: { color: palette.brand, fontWeight: "700", fontSize: 13 },
  delete: { color: palette.danger, fontWeight: "700", fontSize: 13 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "#EEF0EC",
    borderRadius: 999,
  },
  chipSelected: { backgroundColor: palette.brand },
  chipText: { color: "#59635B", fontSize: 14, fontWeight: "600" },
  chipTextSelected: { color: "#FFFFFF" },
  helper: { color: "#7A837B", fontSize: 12, lineHeight: 18, marginTop: 18 },
});

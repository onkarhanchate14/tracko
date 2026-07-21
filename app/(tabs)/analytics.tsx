import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  AnalyticsFilter,
  Bucket,
  computeAnalytics,
  distinctTags,
  emptyFilter,
  filterExpenses,
} from "@/lib/analytics";
import { useApp } from "@/lib/store";
import { colorForCategory, money, palette, seriesColor } from "@/lib/theme";

export default function AnalyticsScreen() {
  const { expenses, categories, people } = useApp();
  const [filter, setFilter] = useState<AnalyticsFilter>(emptyFilter);

  const tags = useMemo(() => distinctTags(expenses), [expenses]);
  const filtered = useMemo(
    () => filterExpenses(expenses, filter),
    [expenses, filter],
  );
  const analytics = useMemo(() => computeAnalytics(filtered), [filtered]);

  const filterActive =
    filter.category !== null || filter.person !== null || filter.tag !== null;

  const weekdayMax = Math.max(1, ...analytics.byWeekday.map((d) => d.total));

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Insights</Text>
          {filterActive ? (
            <Pressable onPress={() => setFilter(emptyFilter)}>
              <Text style={styles.reset}>Reset filters</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterCard}>
          <FilterRow
            label="CATEGORY"
            options={categories}
            selected={filter.category}
            onSelect={(value) => setFilter((f) => ({ ...f, category: value }))}
          />
          <FilterRow
            label="PEOPLE"
            options={people}
            selected={filter.person}
            onSelect={(value) => setFilter((f) => ({ ...f, person: value }))}
          />
          {tags.length > 0 ? (
            <FilterRow
              label="TAGS"
              options={tags}
              selected={filter.tag}
              onSelect={(value) => setFilter((f) => ({ ...f, tag: value }))}
            />
          ) : null}
        </View>

        {analytics.count === 0 ? (
          <View style={styles.card}>
            <Text style={styles.muted}>
              No data for this selection yet. Add a few expenses and insights
              will show up here.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.statRow}>
              <StatCard
                label={filterActive ? "FILTERED TOTAL" : "ALL TIME"}
                value={money(analytics.total)}
              />
              <StatCard label="TRANSACTIONS" value={String(analytics.count)} />
              <StatCard label="AVG / TXN" value={money(analytics.average)} />
            </View>

            <View style={styles.monthCard}>
              <View style={styles.monthCol}>
                <Text style={styles.monthLabel}>THIS MONTH</Text>
                <Text style={styles.monthValue}>
                  {money(analytics.thisMonth)}
                </Text>
              </View>
              <View style={styles.monthCol}>
                <Text style={styles.monthLabel}>LAST MONTH</Text>
                <Text style={styles.monthValueMuted}>
                  {money(analytics.lastMonth)}
                </Text>
              </View>
              <View style={styles.monthCol}>
                <Text style={styles.monthLabel}>CHANGE</Text>
                <Text
                  style={[
                    styles.monthValue,
                    {
                      color:
                        analytics.monthChangePct === null
                          ? palette.inkMuted
                          : analytics.monthChangePct > 0
                            ? palette.danger
                            : palette.brand,
                    },
                  ]}
                >
                  {analytics.monthChangePct === null
                    ? "—"
                    : `${analytics.monthChangePct > 0 ? "+" : ""}${Math.round(
                        analytics.monthChangePct,
                      )}%`}
                </Text>
              </View>
            </View>

            {analytics.insights.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Smart insights</Text>
                <View style={styles.insightList}>
                  {analytics.insights.map((insight) => (
                    <View key={insight.id} style={styles.insightRow}>
                      <View
                        style={[
                          styles.insightDot,
                          {
                            backgroundColor:
                              insight.tone === "warn"
                                ? palette.danger
                                : insight.tone === "good"
                                  ? palette.brand
                                  : "#8896A6",
                          },
                        ]}
                      />
                      <View style={styles.insightTextWrap}>
                        <Text style={styles.insightTitle}>{insight.title}</Text>
                        <Text style={styles.insightDetail}>
                          {insight.detail}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <BucketBars
              title="By category"
              buckets={analytics.byCategory}
              colorFor={(name) => colorForCategory(name)}
            />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Spending by weekday</Text>
              <View style={styles.card}>
                <View style={styles.weekRow}>
                  {analytics.byWeekday.map((day, index) => (
                    <View key={day.day} style={styles.weekCol}>
                      <View style={styles.weekBarTrack}>
                        <View
                          style={[
                            styles.weekBarFill,
                            {
                              height: `${(day.total / weekdayMax) * 100}%`,
                              backgroundColor: seriesColor(index),
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.weekLabel}>{day.day}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top merchants</Text>
              <View style={styles.card}>
                {analytics.topMerchants.map((merchant, index) => (
                  <View key={merchant.merchant} style={styles.merchantRow}>
                    <Text style={styles.merchantRank}>{index + 1}</Text>
                    <View style={styles.merchantInfo}>
                      <Text style={styles.merchantName} numberOfLines={1}>
                        {merchant.merchant}
                      </Text>
                      <Text style={styles.merchantMeta}>
                        {merchant.count} payment
                        {merchant.count === 1 ? "" : "s"}
                      </Text>
                    </View>
                    <Text style={styles.merchantTotal}>
                      {money(merchant.total)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {!filter.person && analytics.byPerson.length > 1 && (
              <BucketBars
                title="By people"
                buckets={analytics.byPerson}
                colorFor={(_name, index) => seriesColor(index)}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChips}
      >
        <FilterChip
          label="All"
          active={selected === null}
          onPress={() => onSelect(null)}
        />
        {options.map((option) => (
          <FilterChip
            key={option}
            label={option}
            active={selected === option}
            onPress={() => onSelect(option)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text
        style={[styles.filterChipText, active && styles.filterChipTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function BucketBars({
  title,
  buckets,
  colorFor,
}: {
  title: string;
  buckets: Bucket[];
  colorFor: (name: string, index: number) => string;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.total));
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {buckets.map((bucket, index) => (
          <View key={bucket.name} style={styles.bucketRow}>
            <View style={styles.bucketTop}>
              <Text style={styles.bucketName} numberOfLines={1}>
                {bucket.name}
              </Text>
              <Text style={styles.bucketValue}>{money(bucket.total)}</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${(bucket.total / max) * 100}%`,
                    backgroundColor: colorFor(bucket.name, index),
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, paddingBottom: 110, gap: 18 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -1,
  },
  reset: { color: palette.brand, fontSize: 13, fontWeight: "700" },
  filterCard: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    paddingVertical: 6,
    boxShadow: "0 1px 3px rgba(32, 42, 35, 0.07)",
  },
  filterRow: { paddingVertical: 8 },
  filterLabel: {
    color: palette.inkMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterChips: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: "#EEF0EC",
    borderRadius: 999,
  },
  filterChipActive: { backgroundColor: palette.brand },
  filterChipText: { color: "#59635B", fontSize: 13, fontWeight: "600" },
  filterChipTextActive: { color: "#FFFFFF" },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: 16,
    gap: 14,
    boxShadow: "0 1px 3px rgba(32, 42, 35, 0.07)",
  },
  muted: { color: palette.inkMuted, fontSize: 14, lineHeight: 20 },
  statRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 1px 3px rgba(32, 42, 35, 0.07)",
  },
  statLabel: {
    color: palette.inkMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  statValue: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 8,
    fontVariant: ["tabular-nums"],
  },
  monthCard: {
    flexDirection: "row",
    backgroundColor: palette.brandDark,
    borderRadius: 20,
    padding: 18,
  },
  monthCol: { flex: 1 },
  monthLabel: {
    color: "#A9C4B0",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  monthValue: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 8,
    fontVariant: ["tabular-nums"],
  },
  monthValueMuted: {
    color: "#BCD8C4",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 8,
    fontVariant: ["tabular-nums"],
  },
  section: { gap: 10 },
  sectionTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  insightList: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: 6,
    boxShadow: "0 1px 3px rgba(32, 42, 35, 0.07)",
  },
  insightRow: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    alignItems: "flex-start",
  },
  insightDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  insightTextWrap: { flex: 1 },
  insightTitle: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  insightDetail: {
    color: palette.inkSoft,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  bucketRow: { gap: 8 },
  bucketTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bucketName: { color: "#323A34", fontSize: 15, flex: 1, marginRight: 12 },
  bucketValue: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EEF1EC",
    overflow: "hidden",
  },
  barFill: { height: 8, borderRadius: 4 },
  weekRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 130,
  },
  weekCol: { flex: 1, alignItems: "center", gap: 8 },
  weekBarTrack: {
    width: 14,
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#F1F4EF",
    borderRadius: 7,
    overflow: "hidden",
  },
  weekBarFill: { width: 14, borderRadius: 7, minHeight: 4 },
  weekLabel: { color: palette.inkMuted, fontSize: 11, fontWeight: "600" },
  merchantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  merchantRank: {
    color: palette.inkMuted,
    fontSize: 14,
    fontWeight: "800",
    width: 18,
  },
  merchantInfo: { flex: 1 },
  merchantName: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  merchantMeta: { color: palette.inkMuted, fontSize: 12, marginTop: 2 },
  merchantTotal: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
});

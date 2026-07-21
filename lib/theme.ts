export const palette = {
  background: "#F4F6F2",
  surface: "#FFFFFF",
  ink: "#1D2520",
  inkSoft: "#5A695E",
  inkMuted: "#777A73",
  brand: "#1D6D40",
  brandDark: "#193D2A",
  line: "#E6E9E5",
  danger: "#BF3D3D",
};

export const categoryColors: Record<string, string> = {
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

const chartPalette = [
  "#1D6D40",
  "#5AA469",
  "#F2A65A",
  "#7C6BF0",
  "#E86C8B",
  "#3FA7D6",
  "#E4B94B",
  "#8896A6",
];

export function colorForCategory(name: string) {
  return categoryColors[name] ?? "#DDE3EC";
}

export function seriesColor(index: number) {
  return chartPalette[index % chartPalette.length];
}

export function money(amount: number) {
  return `₹${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount))}`;
}

export function moneyPrecise(amount: number) {
  return `₹${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

export function dateLabel(date: string) {
  const value = new Date(date);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (value.toDateString() === today.toDateString()) return "Today";
  if (value.toDateString() === yesterday.toDateString()) return "Yesterday";
  return value.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function timeLabel(date: string) {
  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fullDateLabel(date: string) {
  return new Date(date).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

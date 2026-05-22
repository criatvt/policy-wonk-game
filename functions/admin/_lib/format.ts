// Display formatters for admin views. D1 stores timestamps in UTC (from
// either datetime('now') or new Date().toISOString()); we render them in
// IST since the only audience is the admin (Aasif) sitting in India.

export function formatIST(value: string | null | undefined): string {
  if (!value) return "—";
  // Coerce SQL "YYYY-MM-DD HH:MM:SS" (no trailing Z) to a UTC-tagged ISO
  // string so Date parses it as UTC, not local.
  const isoish = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const t = Date.parse(isoish);
  if (!Number.isFinite(t)) return value;
  const d = new Date(t);
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  // Reassemble as "19 May 2026 · 14:32 IST".
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")} · ${get("hour")}:${get("minute")} IST`;
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const isoish = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const t = Date.parse(isoish);
  if (!Number.isFinite(t)) return value;
  const deltaMs = Date.now() - t;
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  const year = Math.floor(day / 365);
  return `${year}y ago`;
}

export function parseLifelines(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => typeof s === "string");
  } catch {
    return [];
  }
}

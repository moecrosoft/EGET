export function todayDateString() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getFullYear()}`;
}

// "07:40" -> "07:40:00", required by OneMap's pt routeType.
export function toOneMapTime(hhmm) {
  return /^\d{2}:\d{2}$/.test(hhmm) ? `${hhmm}:00` : hhmm;
}

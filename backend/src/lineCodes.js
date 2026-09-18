// LTA's TrainServiceAlerts reports some lines at a finer grain than our
// app's 7 canonical lines (NSL, EWL, CCL, DTL, TEL, NEL, BPL) track — e.g.
// the Circle Line Extension comes through as "CEL", not "CCL". Left
// unmapped, that disruption would silently fail to highlight any line pill
// in the UI. Normalize through this table before using a raw `Line` code.
//
// ponytail: only entries we're confident about are filled in — anything
// else passes through as-is with a console.warn (per the "log it, don't
// silently drop it" rule) rather than guessing at unverified extension
// codes. Fill in more as they're confirmed against a live response.
const RAW_TO_CANONICAL = {
  CEL: "CCL", // Circle Line Extension (Bayfront–Marina Bay)
};

export function normalizeLine(rawCode) {
  if (!rawCode) return rawCode;
  const mapped = RAW_TO_CANONICAL[rawCode];
  if (mapped) return mapped;
  if (!["NSL", "EWL", "CCL", "DTL", "TEL", "NEL", "BPL"].includes(rawCode)) {
    console.warn(`[lineCodes] unrecognized line code "${rawCode}" — passing through unmapped`);
  }
  return rawCode;
}

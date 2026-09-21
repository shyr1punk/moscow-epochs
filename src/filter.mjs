export const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
export function matches(r, f) {
  if (
    f.q &&
    !normalize(`${r.name} ${r.title} ${r.address} ${r.ensembleName}`).includes(
      normalize(f.q),
    )
  )
    return false;
  if (f.district && !(r.districts || [r.district]).includes(f.district))
    return false;
  if (f.category && r.category !== f.category) return false;
  if (f.ensemble && r.ensembleId !== f.ensemble) return false;
  if (f.quarter && !r.quarterIds?.includes(f.quarter)) return false;
  if (
    f.box &&
    (!r.center ||
      r.center[0] < f.box[0] ||
      r.center[1] < f.box[1] ||
      r.center[0] > f.box[2] ||
      r.center[1] > f.box[3])
  )
    return false;
  return r.events.length
    ? r.events.some((e) => e.from <= f.to && e.to >= f.from)
    : f.unknown;
}
export function readState(search) {
  const p = new URLSearchParams(search);
  const n = (k, d, min, max) => {
    const x = Number(p.get(k));
    return p.has(k) && Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : d;
  };
  const from = n("from", 1000, 1000, 2026),
    to = n("to", 2026, 1000, 2026);
  let box = p.get("box")?.split(",").map(Number) || null;
  if (
    box &&
    (box.length !== 4 ||
      box.some((v) => !Number.isFinite(v)) ||
      box[0] >= box[2] ||
      box[1] >= box[3])
  )
    box = null;
  return {
    filters: {
      q: p.get("q") || "",
      district: p.get("district") || "",
      category: p.get("category") || "",
      ensemble: p.get("ensemble") || "",
      quarter: p.get("quarter") || "",
      from: Math.min(from, to),
      to: Math.max(from, to),
      unknown: p.get("unknown") !== "0",
      box,
    },
    selected: p.get("object") || "",
    view: {
      lng: n("lng", 37.6185, 35, 40),
      lat: n("lat", 55.752, 54, 57),
      zoom: n("zoom", 12.2, 8, 19),
    },
  };
}
export function encodeState(filters, selected, view) {
  const p = new URLSearchParams();
  for (const k of ["q", "district", "category", "ensemble", "quarter"])
    if (filters[k]) p.set(k, filters[k]);
  p.set("from", String(filters.from));
  p.set("to", String(filters.to));
  p.set("unknown", filters.unknown ? "1" : "0");
  if (filters.box) p.set("box", filters.box.map((v) => v.toFixed(6)).join(","));
  if (selected) p.set("object", selected);
  for (const k of ["lng", "lat", "zoom"])
    p.set(k, view[k].toFixed(k === "zoom" ? 2 : 5));
  return p.toString();
}

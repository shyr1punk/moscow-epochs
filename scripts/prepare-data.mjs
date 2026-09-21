import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { inGeometry } from "../src/spatial.mjs";
import { parseDates } from "../src/dates.mjs";
export function geometries(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap(geometries);
  if (raw.type === "GeometryCollection")
    return (raw.geometries || []).flatMap(geometries);
  return ["Polygon", "MultiPolygon", "Point", "MultiPoint"].includes(raw.type)
    ? [raw]
    : [];
}
const point = (p) =>
  Array.isArray(p) &&
  p.length >= 2 &&
  Number.isFinite(p[0]) &&
  Number.isFinite(p[1]) &&
  p[0] > 35 &&
  p[0] < 40 &&
  p[1] > 54 &&
  p[1] < 57;
const ring = (r) =>
  r.length >= 4 &&
  r.every(point) &&
  r[0][0] === r.at(-1)[0] &&
  r[0][1] === r.at(-1)[1] &&
  Math.abs(
    r.reduce((s, p, i) => {
      const q = r[(i + 1) % r.length];
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) > 1e-12;
export function validGeometry(g) {
  try {
    return g.type === "Point"
      ? point(g.coordinates)
      : g.type === "MultiPoint"
        ? g.coordinates.every(point)
        : g.type === "Polygon"
          ? g.coordinates.length > 0 && g.coordinates.every(ring)
          : g.type === "MultiPolygon"
            ? g.coordinates.length > 0 &&
              g.coordinates.every((p) => p.length > 0 && p.every(ring))
            : false;
  } catch {
    return false;
  }
}
function coords(g) {
  if (g.type === "Point") return [g.coordinates];
  if (g.type === "MultiPoint") return g.coordinates;
  return g.coordinates.flat(g.type === "MultiPolygon" ? 2 : 1);
}
const norm = (s) =>
  String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
const distance = (a, b) => Math.hypot((a[0] - b[0]) * 63, (a[1] - b[1]) * 111);
export async function prepare(rawDir, outputDir) {
  const meta = JSON.parse(
    await fs.readFile(path.join(rawDir, "heritage-meta.json"), "utf8"),
  );
  const raw = JSON.parse(
    execFileSync("unzip", ["-p", path.join(rawDir, "heritage.zip")], {
      maxBuffer: 100 * 1024 * 1024,
    })
      .toString("utf8")
      .replace(/^\uFEFF/, ""),
  );
  if (raw.length !== meta.release.cntObjects)
    throw Error(
      `Registry count mismatch: ${raw.length} != ${meta.release.cntObjects}`,
    );
  const addresses = JSON.parse(
    await fs.readFile(path.join(rawDir, "addresses-matched.json"), "utf8"),
  );
  const byUnom = new Map(addresses.map((a) => [String(a.UNOM), a]));
  const frequencies = new Map();
  for (const r of raw)
    frequencies.set(
      String(r.global_id),
      (frequencies.get(String(r.global_id)) || 0) + 1,
    );
  const records = [],
    features = [];
  let invalid = 0,
    fallbacks = 0,
    addressMatched = 0;
  for (const row of raw) {
    const originalId = String(row.global_id);
    const duplicate = frequencies.get(originalId) > 1;
    const id = duplicate
      ? originalId +
        "-" +
        createHash("sha256")
          .update(JSON.stringify(row))
          .digest("hex")
          .slice(0, 8)
      : originalId;
    const matches = (row.Location || [])
      .map((l) => byUnom.get(String(l.UNOM)))
      .filter(Boolean);
    if (matches.length) addressMatched++;
    const gs = geometries(row.geoData);
    let valid = gs.filter(validGeometry);
    invalid += gs.length - valid.length;
    let geometrySource = "530";
    if (!valid.some((g) => g.type.includes("Polygon"))) {
      const alt = matches
        .flatMap((a) => geometries(a.geoData))
        .filter(validGeometry)
        .filter((g) => g.type.includes("Polygon"));
      if (alt.length) {
        valid = alt;
        geometrySource = "60562";
        fallbacks++;
      }
    }
    const polygons = valid.filter((g) => g.type.includes("Polygon"));
    let chosen = polygons.length ? polygons : valid;
    if (!chosen.length && validGeometry(row.geodata_center || {}))
      chosen = [row.geodata_center];
    const all = chosen.flatMap(coords);
    const bounds = all.length
      ? [
          Math.min(...all.map((p) => p[0])),
          Math.min(...all.map((p) => p[1])),
          Math.max(...all.map((p) => p[0])),
          Math.max(...all.map((p) => p[1])),
        ]
      : null;
    const center = bounds
      ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
      : null;
    const name = row.ObjectNameOnDoc || row.ObjectName || "Объект без названия";
    const dating = parseDates(name);
    const title = (row.ObjectName || name.split(",")[0])
      .replace(/^[-\s]+/, "")
      .trim();
    const r = {
      id,
      originalId,
      duplicate,
      title,
      name,
      address:
        row.Addresses || (row.Location || []).map((l) => l.Address).join("; "),
      district: [...new Set([row.District || ""].flat().filter(Boolean))].join(
        "; ",
      ),
      districts: [...new Set([row.District || ""].flat().filter(Boolean))],
      category: row.Category || "",
      protection: row.SecurityStatus || "",
      type: row.ObjectType || "",
      ensembleName: row.EnsembleNameOnDoc || row.EnsembleName || "",
      ensembleId: "",
      egrkn: row.USRCHONumber || "",
      aisid: row.AISID || "",
      unoms: (row.Location || []).map((l) => l.UNOM).filter(Boolean),
      ...dating,
      center,
      bounds,
      geometryKind: polygons.length
        ? "polygon"
        : chosen.length
          ? "point"
          : "none",
      geometrySource,
      source: `https://data.mos.ru/opendata/530`,
      addressMatches: matches.map((a) => ({
        unom: a.UNOM,
        address: a.ADDRESS || a.SIMPLE_ADDRESS,
      })),
    };
    records.push(r);
    chosen.forEach((g, i) =>
      features.push({
        type: "Feature",
        id: features.length,
        geometry: g,
        properties: { id, epoch: r.epoch, kind: r.geometryKind },
      }),
    );
  }
  const quarterRaw = JSON.parse(
    execFileSync("unzip", ["-p", path.join(rawDir, "quarters.zip")], {
      maxBuffer: 200 * 1024 * 1024,
    })
      .toString("utf8")
      .replace(/^\uFEFF/, ""),
  );
  const quarters = [];
  const quarterFeatures = [];
  for (const q of quarterRaw) {
    const gs = geometries(q.geoData)
      .filter(validGeometry)
      .filter((g) => g.type.includes("Polygon"));
    if (!gs.length) continue;
    const points = gs.flatMap(coords);
    const b = points.reduce(
      (b, p) => [
        Math.min(b[0], p[0]),
        Math.min(b[1], p[1]),
        Math.max(b[2], p[0]),
        Math.max(b[3], p[1]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
    const members = records.filter(
      (r) =>
        r.center &&
        r.center[0] >= b[0] &&
        r.center[0] <= b[2] &&
        r.center[1] >= b[1] &&
        r.center[1] <= b[3] &&
        gs.some((g) => inGeometry(r.center, g)),
    );
    if (!members.length) continue;
    const id = String(q.global_id);
    members.forEach((r) => {
      r.quarterIds ??= [];
      r.quarterIds.push(id);
    });
    quarters.push({
      id,
      name: q.FullAdrComponentName,
      district: q.OMK_MO_Name,
      count: members.length,
      bounds: b,
    });
    gs.forEach((g) =>
      quarterFeatures.push({
        type: "Feature",
        geometry: g,
        properties: { id },
      }),
    );
  }
  const names = new Map();
  for (const r of records) {
    if (r.ensembleName) {
      const key = norm(r.ensembleName);
      if (!names.has(key)) names.set(key, []);
      names.get(key).push(r);
    }
  }
  const ensembles = [];
  for (const [name, group] of names) {
    // Separate identically named groups that are geographically disconnected.
    const remaining = new Set(group);
    let clusterNo = 0;
    while (remaining.size) {
      const first = remaining.values().next().value;
      remaining.delete(first);
      const cluster = [first];
      for (let i = 0; i < cluster.length; i++)
        for (const r of remaining) {
          if (
            r.center &&
            cluster[i].center &&
            distance(r.center, cluster[i].center) < 2 &&
            (r.unoms.some((u) => cluster[i].unoms.includes(u)) ||
              (norm(r.address.split(/,\s*(?:дом|д\.)/i)[0]) !== "" &&
                norm(r.address.split(/,\s*(?:дом|д\.)/i)[0]) ===
                  norm(cluster[i].address.split(/,\s*(?:дом|д\.)/i)[0])) ||
              (distance(r.center, cluster[i].center) < 0.25 &&
                r.districts.some((d) => cluster[i].districts.includes(d))))
          ) {
            cluster.push(r);
            remaining.delete(r);
          }
        }
      if (cluster.length < 2) continue;
      const id = createHash("sha256")
        .update(name + ":" + clusterNo++ + ":" + first.id)
        .digest("hex")
        .slice(0, 14);
      cluster.forEach((r) => (r.ensembleId = id));
      ensembles.push({
        id,
        name: first.ensembleName,
        count: cluster.length,
        members: cluster.map((r) => r.id),
      });
    }
  }
  if (new Set(records.map((r) => r.id)).size !== records.length)
    throw Error("Duplicate registry identifiers");
  const counts = {
    total: records.length,
    uniqueSourceIds: frequencies.size,
    duplicateIdentifiers: [...frequencies.values()].filter((n) => n > 1).length,
    quarters: quarters.length,
    quarterMembers: records.filter((r) => r.quarterIds?.length).length,
    polygons: records.filter((r) => r.geometryKind === "polygon").length,
    points: records.filter((r) => r.geometryKind === "point").length,
    withoutGeometry: records.filter((r) => r.geometryKind === "none").length,
    dated: records.filter((r) => r.status === "dated").length,
    multiple: records.filter((r) => r.status === "multiple").length,
    unknown: records.filter((r) => r.status === "unknown").length,
    ensembles: ensembles.length,
    ensembleMembers: records.filter((r) => r.ensembleId).length,
    addressMatched,
    addressFallbacks: fallbacks,
    invalidGeometries: invalid,
  };
  // Dating status is distinct from the legal protection status.
  await fs.mkdir(path.join(outputDir, "details"), { recursive: true });
  const index = records.map((r, i) => ({
    id: r.id,
    duplicate: r.duplicate,
    quarterIds: r.quarterIds || [],
    title: r.title,
    name: r.name,
    address: r.address,
    district: r.district,
    districts: r.districts,
    category: r.category,
    ensembleId: r.ensembleId,
    ensembleName: r.ensembleName,
    epoch: r.epoch,
    events: r.events,
    dateStatus: r.status,
    center: r.center,
    bounds: r.bounds,
    geometryKind: r.geometryKind,
    chunk: Math.floor(i / 400),
  }));
  for (let i = 0; i < records.length; i += 400)
    await fs.writeFile(
      path.join(outputDir, "details", `${Math.floor(i / 400)}.json`),
      JSON.stringify(
        Object.fromEntries(records.slice(i, i + 400).map((r) => [r.id, r])),
      ),
    );
  await fs.writeFile(path.join(outputDir, "index.json"), JSON.stringify(index));
  await fs.writeFile(
    path.join(outputDir, "geometry.geojson"),
    JSON.stringify({ type: "FeatureCollection", features }),
  );
  await fs.writeFile(
    path.join(outputDir, "ensembles.json"),
    JSON.stringify(ensembles),
  );
  await fs.writeFile(
    path.join(outputDir, "quarters.json"),
    JSON.stringify(quarters),
  );
  await fs.writeFile(
    path.join(outputDir, "quarters.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: quarterFeatures }),
  );
  const sources = [];
  for (const [name, datasetId] of [
    ["heritage", 530],
    ["address", 60562],
    ["quarters", 64068],
  ]) {
    const m = JSON.parse(
      await fs.readFile(path.join(rawDir, `${name}-meta.json`), "utf8"),
    );
    const data = await fs.readFile(path.join(rawDir, `${name}.zip`));
    const exports = JSON.parse(
      await fs.readFile(path.join(rawDir, `${name}-export.json`), "utf8"),
    );
    const exportFile = exports.find(
      (e) =>
        e.versionNum === m.actualData.versionNum &&
        e.releaseNum === m.release.releaseNum,
    );
    sources.push({
      downloadUrl: exportFile
        ? `https://data.mos.ru/api/v2/odata/MEDIA/getFile?id=${exportFile.fileId}`
        : null,
      datasetId,
      url: `https://data.mos.ru/opendata/${datasetId}`,
      version: m.actualData.versionNum,
      release: m.release.releaseNum,
      updated: m.release.openDate,
      records: m.release.cntObjects,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources,
    counts,
    quarterMode: "official-and-rectangle",
    quarterNote:
      "Набор №64068 — современные учётные кварталы; отбор по центру геометрии объекта. Они не обозначают исторические границы. Для произвольной территории используется выделение области.",
    methodology: {
      dateRole: "Датировка из названия; не гарантированный год постройки",
      approximation:
        "Начало века: первые 33 года; середина: следующие 33; конец: оставшиеся. Половины: по 50 лет.",
      ensembles:
        "Совпадение названия и адресного контекста (УНОМ или улица) при расстоянии менее 2 км; либо менее 250 м в одном районе. Минимум два участника.",
    },
  };
  await fs.writeFile(
    path.join(outputDir, "report.json"),
    JSON.stringify(report, null, 2),
  );
  return report;
}

import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { validGeometry } from "./prepare-data.mjs";
const m = JSON.parse(await fs.readFile("public/data/manifest.json", "utf8"));
const base = `public/data/snapshots/${m.snapshot}`;
const index = JSON.parse(await fs.readFile(`${base}/index.json`, "utf8"));
const geo = JSON.parse(await fs.readFile(`${base}/geometry.geojson`, "utf8"));
const ensembles = JSON.parse(
  await fs.readFile(`${base}/ensembles.json`, "utf8"),
);
assert.equal(index.length, m.report.sources[0].records);
assert.equal(new Set(index.map((r) => r.id)).size, index.length);
const ids = new Set(index.map((r) => r.id));
for (const f of geo.features) {
  assert(ids.has(f.properties.id));
  assert(validGeometry(f.geometry));
}
for (const e of ensembles) {
  assert(e.members.length >= 2);
  for (const id of e.members) assert(ids.has(id));
}
for (const r of index) {
  for (const e of r.events) assert(e.from <= e.to);
  assert(["dated", "multiple", "unknown"].includes(r.dateStatus));
  if (r.ensembleId)
    assert(
      ensembles.some((e) => e.id === r.ensembleId && e.members.includes(r.id)),
    );
}
for (const chunk of new Set(index.map((r) => r.chunk))) {
  const details = JSON.parse(
    await fs.readFile(`${base}/details/${chunk}.json`, "utf8"),
  );
  for (const r of index.filter((r) => r.chunk === chunk))
    assert.equal(details[r.id].id, r.id);
}
console.log(
  `Verified ${index.length} objects, ${geo.features.length} geometries, ${ensembles.length} ensembles`,
);

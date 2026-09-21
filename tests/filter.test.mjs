import test from "node:test";
import assert from "node:assert/strict";
import { matches, encodeState, readState } from "../src/filter.mjs";
import { inGeometry } from "../src/spatial.mjs";
const filters = {
  q: "",
  district: "",
  category: "",
  ensemble: "",
  quarter: "",
  from: 1800,
  to: 1899,
  unknown: true,
  box: null,
};
const row = {
  name: "Назаровская башня",
  title: "Башня",
  address: "Нововаганьковский переулок",
  ensembleName: "Обсерватория",
  ensembleId: "e1",
  district: "Пресненский район",
  category: "регионального значения",
  center: [37.57, 55.75],
  events: [{ from: 1895, to: 1895 }],
  quarterIds: ["q1"],
};
test("filters intersect across search, dates, district and ensemble", () => {
  assert(
    matches(row, {
      ...filters,
      q: "НАЗАРОВ",
      district: row.district,
      ensemble: "e1",
    }),
  );
  assert(!matches(row, { ...filters, from: 1900, to: 1950 }));
  assert(!matches(row, { ...filters, quarter: "q2" }));
  assert(!matches(row, { ...filters, box: [38, 55, 39, 56] }));
  assert(matches(row, { ...filters, quarter: "q1" }));
});
test("unknown dates explicit opt-in", () => {
  assert(matches({ ...row, events: [] }, filters));
  assert(!matches({ ...row, events: [] }, { ...filters, unknown: false }));
});
test("partial intervals match overlap", () =>
  assert(matches({ ...row, events: [{ from: 1780, to: 1820 }] }, filters)));
test("URL roundtrip keeps filters, selection, rectangle and map view", () => {
  const f = { ...filters, q: "Дом на Арбате", box: [37.5, 55.7, 37.6, 55.8] };
  const v = { lng: 37.6185, lat: 55.752, zoom: 14.1 };
  assert.deepEqual(readState(encodeState(f, "2949468", v)), {
    filters: f,
    selected: "2949468",
    view: v,
  });
});
test("invalid URL values are bounded and do not crash", () => {
  const s = readState("from=NaN&to=-4&lng=900&box=1,2,x,4");
  assert.equal(s.filters.box, null);
  assert.equal(s.view.lng, 40);
  assert.equal(s.filters.to, 1000);
});
test("quarter inclusion respects polygon holes", () => {
  const g = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [5, 0],
        [5, 5],
        [0, 5],
        [0, 0],
      ],
      [
        [1, 1],
        [2, 1],
        [2, 2],
        [1, 2],
        [1, 1],
      ],
    ],
  };
  assert(inGeometry([3, 3], g));
  assert(!inGeometry([1.5, 1.5], g));
  assert(!inGeometry([8, 8], g));
});

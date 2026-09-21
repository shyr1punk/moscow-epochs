import test from "node:test";
import assert from "node:assert/strict";
import { validGeometry, geometries } from "../scripts/prepare-data.mjs";
test("accept real WGS84 Moscow polygon; reject swapped coordinates and unclosed ring", () => {
  const ring = [
    [37, 55],
    [37.1, 55],
    [37.1, 55.1],
    [37, 55],
  ];
  assert(validGeometry({ type: "Polygon", coordinates: [ring] }));
  assert(!validGeometry({ type: "Polygon", coordinates: [ring.slice(0, -1)] }));
  assert(!validGeometry({ type: "Point", coordinates: [55, 37] }));
  assert(!validGeometry({ type: "Point", coordinates: [null, null] }));
});
test("normalize the source geometry array and collections", () => {
  assert.equal(
    geometries([
      { type: "Point", coordinates: [37, 55] },
      {
        type: "GeometryCollection",
        geometries: [{ type: "Point", coordinates: [37, 55] }],
      },
    ]).length,
    2,
  );
});

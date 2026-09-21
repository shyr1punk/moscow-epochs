import test from "node:test";
import assert from "node:assert/strict";
import { parseDates } from "../src/dates.mjs";
test("exact dating and architect", () => {
  const d = parseDates("Назаровская башня, 1895 г., арх. К.М.Быковский");
  assert.equal(d.events[0].from, 1895);
  assert.equal(d.epoch, "19");
});
test("range, Roman century, partial century and decades", () => {
  assert.equal(parseDates("Церковь, 1825–1837 гг.").events[0].to, 1837);
  assert.deepEqual(
    parseDates("Палаты, XVII в.").events.map((d) => [d.from, d.to]),
    [[1601, 1700]],
  );
  assert.equal(parseDates("Дом, конец XVIII в.").events[0].from, 1767);
  assert.equal(parseDates("Дом, 1930-е гг.").events[0].to, 1939);
  assert.equal(parseDates("Дом, XVIII–XIX вв.").events[0].to, 1900);
});
test("multiple datings are retained, duplicates collapsed", () => {
  assert.equal(
    parseDates("Дом, 1812–1825 гг., 1895 г., 1901 г.").events.length,
    3,
  );
  assert.equal(parseDates("Дом, 1907 г., 1907 г.").events.length, 1);
});
test("historical associations are not construction dates", () => {
  assert.equal(
    parseDates("Больница, 1905 г. С 1957 г. — Институт мозга").events.length,
    1,
  );
  assert.equal(
    parseDates("Дом, в котором в 1895 г. жил писатель").status,
    "unknown",
  );
  assert.equal(parseDates("Дом № 1905").status, "unknown");
  assert.equal(parseDates("Памятник героям войны 1812 г.").status, "unknown");
});
test("construction and reconstruction keep distinct roles", () => {
  const d = parseDates("Дом, построен в 1850 г., перестроен в 1901 г.");
  assert.deepEqual(
    d.events.map((e) => e.role),
    ["строительство", "перестройка"],
  );
});

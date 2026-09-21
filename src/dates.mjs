// Deliberately conservative: these are documented datings, not inferred construction years.
const roman = (s) => {
  const n = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  return [...s].reduce(
    (v, c, i) => v + (n[c] < (n[s[i + 1]] || 0) ? -n[c] : n[c]),
    0,
  );
};
export const EPOCHS = [
  { id: "early", label: "До 1700", from: 1, to: 1699, color: "#846bc1" },
  { id: "18", label: "XVIII век", from: 1700, to: 1799, color: "#477ed0" },
  { id: "19", label: "XIX век", from: 1800, to: 1899, color: "#d99539" },
  { id: "modern", label: "1900–1917", from: 1900, to: 1917, color: "#dc6851" },
  { id: "soviet", label: "1918–1955", from: 1918, to: 1955, color: "#40a79c" },
  { id: "late", label: "1956–1991", from: 1956, to: 1991, color: "#669957" },
  { id: "recent", label: "С 1992", from: 1992, to: 2100, color: "#b774a3" },
  {
    id: "multiple",
    label: "Несколько дат / эпох",
    from: 0,
    to: 0,
    color: "#747f91",
  },
  {
    id: "unknown",
    label: "Дата не определена",
    from: 0,
    to: 0,
    color: "#a7aeb8",
  },
];
export function parseDates(input) {
  const text = String(input || "")
    .replace(/[–—−]/g, "-")
    .replace(/Х/g, "X")
    .replace(/І/g, "I");
  // Historical associations and people are not the date of the building.
  const stop = text.search(
    /(?:(?<![а-яА-Я])[Сс]\s+(?=\d{4}\s*г)|[Зз]десь|[Вв]\s+котор(?:ом|ой|ых)|[Сс]вязан[аоы]?\s+с|[Гг]де\s|[Мм]есто,?\s+(?:где|казни)|[Вв]\s+память)/u,
  );
  const prefix = stop < 0 ? text : text.slice(0, stop);
  const found = [];
  const re =
    /(?:\d-я\s+)?(?:первая\s+половина|вторая\s+половина|1-я\s+пол(?:овина|\.)?|2-я\s+пол(?:овина|\.)?|начало|нач\.|середина|сер\.|конец|кон\.)?\s*[IVX]{1,6}(?:\s*-\s*(?:(?:начало|нач\.|конец|кон\.)\s*)?[IVX]{1,6})?\s*в(?:в|ек(?:а|ов)?)?\.?|(?<!\d)(?:1\d{3}|20\d{2})(?:\s*-\s*(?:1\d{3}|20\d{2}))?(?:-?\s*[еы]е?)?\s*г(?:г|од(?:а|ов|у)?)?\.?/gu;
  for (const m of prefix.matchAll(re)) {
    const raw = m[0].trim();
    let from, to, precision;
    const centuries = [...raw.matchAll(/[IVX]+/g)].map((x) => roman(x[0]));
    if (centuries.length) {
      if (centuries.some((c) => c < 10 || c > 21)) continue;
      from = (centuries[0] - 1) * 100 + 1;
      to = centuries.at(-1) * 100;
      precision = "век";
      if (centuries.length === 1) {
        if (/нач/.test(raw)) {
          to = from + 32;
          precision = "начало века";
        } else if (/сер/.test(raw)) {
          from += 33;
          to = from + 32;
          precision = "середина века";
        } else if (/кон/.test(raw)) {
          from += 66;
          precision = "конец века";
        } else if (/первая|1-я/.test(raw)) {
          to = from + 49;
          precision = "первая половина века";
        } else if (/вторая|2-я/.test(raw)) {
          from += 50;
          precision = "вторая половина века";
        }
      } else precision = "диапазон веков";
    } else {
      const years = raw.match(/\d{4}/g).map(Number);
      from = years[0];
      to = years.at(-1);
      precision = years.length > 1 ? "диапазон" : "год";
      if (/\d[\s-]*[еы]/.test(raw)) {
        to += 9;
        precision = "десятилетие";
      }
    }
    if (from > to) continue;
    const before = prefix
      .slice(Math.max(0, m.index - 45), m.index)
      .toLowerCase();
    // A birth/death, memorial event, archaeological find or number alone is not a building date.
    if (
      /родил|умер|погиб|установлен.*памят|посвящ|событи|восстани|войн|жили|жил\s|работал|похорон/.test(
        before,
      )
    )
      continue;
    const role = /реставр/.test(before)
      ? "реставрация"
      : /перестро|реконструк|надстро/.test(before)
        ? "перестройка"
        : /постро|сооруж|возвед/.test(before)
          ? "строительство"
          : "датировка в названии";
    if (!found.some((x) => x.from === from && x.to === to && x.role === role))
      found.push({ from, to, precision, role, raw });
  }
  const epochs = new Set(
    found.flatMap((d) =>
      EPOCHS.slice(0, 7)
        .filter((e) => d.from <= e.to && d.to >= e.from)
        .map((e) => e.id),
    ),
  );
  return {
    events: found,
    status: !found.length
      ? "unknown"
      : found.length > 1 || epochs.size > 1
        ? "multiple"
        : "dated",
    epoch: !found.length
      ? "unknown"
      : found.length > 1 || epochs.size > 1
        ? "multiple"
        : [...epochs][0] || "unknown",
  };
}

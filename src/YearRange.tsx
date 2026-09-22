import { useMemo, useState } from "react";
import { EPOCHS } from "./dates.mjs";
import type { Entry } from "./types";
const MIN = 1000,
  MAX = 2026;
const position = (year: number) => ((year - MIN) / (MAX - MIN)) * 100;
export default function YearRange({
  entries,
  from,
  to,
  onChange,
}: {
  entries: Entry[];
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
}) {
  const [inspectedYear, setInspectedYear] = useState<number | null>(null);
  const counts = useMemo(() => {
    const result = Array<number>(MAX - MIN + 1).fill(0);
    for (const entry of entries) {
      const years = new Set(
        entry.events
          .filter((e) => e.from === e.to && e.from >= MIN && e.to <= MAX)
          .map((e) => e.from),
      );
      for (const year of years) result[year - MIN]++;
    }
    return result;
  }, [entries]);
  const peak = Math.max(1, ...counts);
  const gradient = `linear-gradient(to right, ${EPOCHS.slice(0, 7)
    .map(
      (e) =>
        `${e.color} ${position(Math.max(MIN, e.from))}%, ${e.color} ${position(Math.min(MAX, e.to + 1))}%`,
    )
    .join(", ")})`;
  return (
    <div className="year-range">
      <div className="range-values">
        <span>
          От <strong>{from}</strong>
        </span>
        <span>
          До <strong>{to}</strong>
        </span>
      </div>
      <div
        className="year-histogram"
        aria-label="Количество объектов с точной датировкой по годам"
      >
        <span className="histogram-scale">{peak}</span>
        {inspectedYear !== null && (
          <span className="histogram-readout">
            {inspectedYear}: {counts[inspectedYear - MIN]} объектов
          </span>
        )}
        <svg
          onPointerMove={(e) => {
            const bounds = e.currentTarget.getBoundingClientRect();
            setInspectedYear(
              Math.max(
                MIN,
                Math.min(
                  MAX,
                  Math.round(
                    MIN +
                      ((e.clientX - bounds.left) / bounds.width) * (MAX - MIN),
                  ),
                ),
              ),
            );
          }}
          onPointerLeave={() => setInspectedYear(null)}
          viewBox={`0 0 ${counts.length} 56`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Столбики количества объектов по годам; высота линейная"
        >
          {counts.map((count, i) => {
            if (!count) return null;
            const year = MIN + i;
            const color = EPOCHS.find(
              (e) => year >= e.from && year <= e.to,
            )?.color;
            const height = (count / peak) * 52;
            return (
              <rect
                key={year}
                x={i}
                y={56 - height}
                width="0.9"
                height={height}
                fill={color}
                opacity={year >= from && year <= to ? 1 : 0.2}
              >
                <title>
                  {year}: {count} объектов с точной датировкой
                </title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div
        className="dual-range-track"
        style={{ background: gradient }}
        onPointerDown={(e) => {
          const bounds = e.currentTarget.getBoundingClientRect();
          const year = Math.max(
            MIN,
            Math.min(
              MAX,
              Math.round(
                MIN + ((e.clientX - bounds.left) / bounds.width) * (MAX - MIN),
              ),
            ),
          );
          if (Math.abs(year - from) <= Math.abs(year - to))
            onChange(Math.min(year, to), to);
          else onChange(from, Math.max(year, from));
        }}
      >
        <span
          className="range-dim"
          style={{ left: 0, width: `${position(from)}%` }}
        />
        <span
          className="range-dim"
          style={{ right: 0, width: `${100 - position(to)}%` }}
        />
      </div>
      <div className="dual-range-inputs">
        <input
          aria-label="Начало периода"
          aria-valuetext={`${from} год`}
          type="range"
          min={MIN}
          max={MAX}
          value={from}
          onChange={(e) => onChange(Math.min(+e.target.value, to), to)}
        />
        <input
          aria-label="Конец периода"
          aria-valuetext={`${to} год`}
          type="range"
          min={MIN}
          max={MAX}
          value={to}
          onChange={(e) => onChange(from, Math.max(+e.target.value, from))}
        />
      </div>
      <div className="year-ticks" aria-hidden="true">
        {[1000, 1500, 1800, 2026].map((year) => (
          <span key={year} style={{ left: `${position(year)}%` }}>
            {year}
          </span>
        ))}
      </div>
      <p className="histogram-caption">
        Столбики — объекты с точным годом в датировке, включая перестройки.
        Диапазоны и неизвестные даты не распределены по годам.
      </p>
    </div>
  );
}

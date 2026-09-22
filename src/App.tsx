import YearRange from "./YearRange";
import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import {
  Search,
  X,
  ArrowUpRight,
  SlidersHorizontal,
  Info,
  Link,
  Landmark,
  MapPin,
  ChevronRight,
  Clock3,
  RotateCcw,
  Layers,
  Check,
  ExternalLink,
} from "lucide-react";
import MapView from "./MapView";
import { useAgentTools } from "./useAgentTools";
import { EPOCHS } from "./dates.mjs";
import { matches, readState, encodeState } from "./filter.mjs";
import type {
  Entry,
  Detail,
  Ensemble,
  Quarter,
  Manifest,
  Filters,
  View,
} from "./types";
const BASE = import.meta.env.BASE_URL;
const initial = readState(location.search);
const number = (n: number) => n.toLocaleString("ru-RU");
const epochFor = (id: string) => EPOCHS.find((e) => e.id === id) || EPOCHS[8];
const dating = (r: Entry) =>
  r.events.length
    ? r.events.map((e) => e.raw).join(" · ")
    : "Датировка не определена";
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="detail-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null),
    [entries, setEntries] = useState<Entry[]>([]),
    [ensembles, setEnsembles] = useState<Ensemble[]>([]),
    [quarters, setQuarters] = useState<Quarter[]>([]),
    [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState<Filters>(initial.filters),
    [selected, setSelected] = useState(initial.selected),
    [view, setView] = useState<View>(initial.view),
    [focus, setFocus] = useState<Entry | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [detailError, setDetailError] = useState("");
  const [mobileFilters, setMobileFilters] = useState(false),
    [limit, setLimit] = useState(40),
    [copied, setCopied] = useState(false);
  const timeline = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = timeline.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const bottom = Number.parseFloat(getComputedStyle(element).bottom) || 0;
      element.parentElement?.style.setProperty(
        "--timeline-clearance",
        `${element.getBoundingClientRect().height + bottom + 16}px`,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const about = useRef<HTMLDialogElement>(null);
  const detailCache = useRef(new Map<number, Record<string, Detail>>());
  const dataBase = manifest ? `${BASE}data/snapshots/${manifest.snapshot}` : "";
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`${BASE}data/manifest.json`);
        if (!res.ok) throw Error();
        const m: Manifest = await res.json();
        const base = `${BASE}data/snapshots/${m.snapshot}`;
        const result = await Promise.all(
          ["index.json", "ensembles.json", "quarters.json"].map(async (p) => {
            const r = await fetch(`${base}/${p}`);
            if (!r.ok) throw Error();
            return r.json();
          }),
        );
        if (alive) {
          setManifest(m);
          setEntries(result[0]);
          setEnsembles(result[1]);
          setQuarters(result[2]);
        }
      } catch {
        if (alive)
          setLoadError(
            "Не удалось загрузить реестр. Проверьте соединение и обновите страницу.",
          );
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);
  const deferredQ = useDeferredValue(filters.q);
  const visible = useMemo(
    () => entries.filter((r) => matches(r, { ...filters, q: deferredQ })),
    [entries, filters, deferredQ],
  );
  const visibleIds = useMemo(() => visible.map((r) => r.id), [visible]);
  const current = entries.find((r) => r.id === selected) || null;
  const currentEnsemble = ensembles.find(
    (e) => e.id === (filters.ensemble || current?.ensembleId),
  );
  const highlight = useMemo(
    () => currentEnsemble?.members || [],
    [currentEnsemble],
  );
  const districts = useMemo(
    () =>
      [...new Set(entries.flatMap((r) => r.districts).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "ru"),
      ),
    [entries],
  );
  const categories = useMemo(
    () => [...new Set(entries.map((r) => r.category).filter(Boolean))].sort(),
    [entries],
  );
  const availableQuarters = useMemo(() => {
    const ids = new Set(
      entries
        .filter(
          (r) => !filters.district || r.districts.includes(filters.district),
        )
        .flatMap((r) => r.quarterIds),
    );
    return quarters
      .filter((q) => ids.has(q.id))
      .sort(
        (a, b) =>
          a.district.localeCompare(b.district, "ru") ||
          a.name.localeCompare(b.name, "ru", { numeric: true }),
      );
  }, [quarters, entries, filters.district]);
  useEffect(() => {
    setLimit(40);
  }, [filters]);
  useEffect(() => {
    if (entries.length && selected && !visibleIds.includes(selected))
      setSelected("");
  }, [visibleIds, entries.length, selected]);
  useEffect(() => {
    const timeout = setTimeout(
      () =>
        history.replaceState(
          null,
          "",
          `${location.pathname}?${encodeState(filters, selected, view)}`,
        ),
      250,
    );
    return () => clearTimeout(timeout);
  }, [filters, selected, view]);
  useEffect(() => {
    if (!current || !dataBase) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetail(null);
    setDetailError("");
    async function load() {
      try {
        let chunk = detailCache.current.get(current!.chunk);
        if (!chunk) {
          const r = await fetch(`${dataBase}/details/${current!.chunk}.json`);
          if (!r.ok) throw Error();
          chunk = await r.json();
          detailCache.current.set(current!.chunk, chunk!);
        }
        if (alive) setDetail(chunk![current!.id]);
      } catch {
        if (alive)
          setDetailError(
            "Не удалось загрузить сведения. Закройте карточку и попробуйте ещё раз.",
          );
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [current, dataBase]);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const selectObject = (id: string, fly = true) => {
    setSelected(id);
    setMobileFilters(false);
    if (fly) setFocus(entries.find((r) => r.id === id) || null);
  };
  const reset = () => {
    setFilters({
      q: "",
      district: "",
      category: "",
      ensemble: "",
      quarter: "",
      from: 1000,
      to: 2026,
      unknown: true,
      box: null,
    });
    setSelected("");
    setFocus(null);
  };
  const chooseEnsemble = (id: string) => {
    setFilters({
      q: "",
      district: "",
      category: "",
      ensemble: id,
      quarter: "",
      from: 1000,
      to: 2026,
      unknown: true,
      box: null,
    });
    const e = ensembles.find((e) => e.id === id);
    const rs = entries.filter((r) => e?.members.includes(r.id) && r.bounds);
    if (rs.length) {
      const bounds = rs.reduce<[number, number, number, number]>(
        (b, r) =>
          [
            Math.min(b[0], r.bounds![0]),
            Math.min(b[1], r.bounds![1]),
            Math.max(b[2], r.bounds![2]),
            Math.max(b[3], r.bounds![3]),
          ] as [number, number, number, number],
        [Infinity, Infinity, -Infinity, -Infinity],
      );
      setFocus({ ...rs[0], bounds });
    }
  };
  useAgentTools(entries, filters, setFilters, selectObject);
  const chooseQuarter = (id: string) => {
    set("quarter", id);
    const q = quarters.find((q) => q.id === id);
    if (q && entries[0]) setFocus({ ...entries[0], bounds: q.bounds });
  };
  const share = async () => {
    const url = `${location.origin}${location.pathname}?${encodeState(filters, selected, view)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Ссылка на выбранную карту", url);
    }
  };
  const counts = manifest?.report.counts;
  const activeFilters = Boolean(
    filters.q ||
    filters.district ||
    filters.category ||
    filters.ensemble ||
    filters.quarter ||
    filters.box ||
    filters.from !== 1000 ||
    filters.to !== 2026 ||
    !filters.unknown,
  );
  return (
    <main className="app">
      <header className="header">
        <a
          className="brand"
          href={BASE}
          aria-label="Москва по эпохам — главная"
        >
          <span className="brand-icon">
            <Landmark size={23} />
          </span>
          <span>
            Москва <i>по эпохам</i>
          </span>
        </a>
        <span className="header-label">ИСТОРИЧЕСКИЙ АТЛАС</span>
        <div className="header-right">
          <span className="snapshot-label">
            Реестр ·{" "}
            {manifest?.report.sources[0].updated.split(" ")[0] || "загрузка"}
          </span>
          <button
            className="header-btn"
            onClick={() => about.current?.showModal()}
          >
            <Info size={17} />
            <span>О данных</span>
          </button>
          <button
            className="header-btn"
            onClick={share}
            aria-label="Скопировать ссылку на карту"
          >
            {copied ? <Check size={17} /> : <Link size={17} />}
            <span>{copied ? "Скопировано" : "Поделиться"}</span>
          </button>
        </div>
      </header>
      <section
        className={`sidebar ${mobileFilters ? "mobile-open" : ""}`}
        aria-label="Поиск и фильтры объектов"
      >
        <div className="sidebar-intro">
          <div className="eyebrow">
            АРХИТЕКТУРА ВО ВРЕМЕНИ <span>01 / МОСКВА</span>
          </div>
          <div className="title-row">
            <h1>
              Город.
              <br />
              <em>Слой за слоем.</em>
            </h1>
            <button
              className="mobile-close icon-btn"
              aria-label="Закрыть фильтры"
              onClick={() => setMobileFilters(false)}
            >
              <X />
            </button>
          </div>
          <p>
            Исследуйте здания и ансамбли.
            <br />
            Выберите эпоху — найдите её в городе.
          </p>
        </div>
        <div className="filters">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Поиск по названию или адресу"
              placeholder="Название или адрес"
              value={filters.q}
              onChange={(e) => set("q", e.target.value)}
            />
            {filters.q && (
              <button aria-label="Очистить поиск" onClick={() => set("q", "")}>
                <X size={16} />
              </button>
            )}
          </label>
          <div className="filter-grid">
            <label>
              Район
              <select
                aria-label="Район"
                value={filters.district}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    district: e.target.value,
                    quarter: "",
                  }))
                }
              >
                <option value="">Вся Москва</option>
                {districts.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Категория
              <select
                aria-label="Категория"
                value={filters.category}
                onChange={(e) => set("category", e.target.value)}
              >
                <option value="">Все категории</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <details
            className="extra-filters"
            open={!!filters.ensemble || !!filters.quarter}
          >
            <summary>
              <SlidersHorizontal size={15} /> Ансамбли и кварталы{" "}
              <ChevronRight size={15} />
            </summary>
            <label>
              Ансамбль
              <select
                aria-label="Ансамбль"
                value={filters.ensemble}
                onChange={(e) => chooseEnsemble(e.target.value)}
              >
                <option value="">Все ансамбли</option>
                {ensembles.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.count}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Учётный квартал
              <select
                aria-label="Учётный квартал"
                value={filters.quarter}
                onChange={(e) => chooseQuarter(e.target.value)}
              >
                <option value="">Все кварталы</option>
                {availableQuarters.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name} · {q.district.replace("муниципальный округ ", "")}
                  </option>
                ))}
              </select>
            </label>
            <small>Современное деление, не исторические границы.</small>
          </details>
          {filters.box && (
            <button className="filter-chip" onClick={() => set("box", null)}>
              Выделенная область <X size={13} />
            </button>
          )}
        </div>
        <div className="results-header">
          <span>
            <strong>{number(visible.length)}</strong>{" "}
            <span>из {number(entries.length)} записей</span>
          </span>
          {activeFilters ? (
            <button onClick={reset} title="Сбросить все фильтры">
              <RotateCcw size={14} /> Сбросить
            </button>
          ) : (
            <span className="small-muted">В реестре</span>
          )}
        </div>
        <div
          className="results"
          aria-label="Результаты поиска"
          aria-live="polite"
        >
          {loadError ? (
            <div className="empty">
              <Info />
              <h2>Реестр недоступен</h2>
              <p>{loadError}</p>
              <button className="primary" onClick={() => location.reload()}>
                Повторить
              </button>
            </div>
          ) : !manifest ? (
            <div className="empty">
              <span className="spinner" />
              <p>Загружаем реестр Москвы…</p>
            </div>
          ) : !visible.length ? (
            <div className="empty">
              <Search />
              <h2>Здесь пока пусто</h2>
              <p>Попробуйте другую эпоху или снимите часть фильтров.</p>
              <button className="primary" onClick={reset}>
                Сбросить фильтры
              </button>
            </div>
          ) : (
            <>
              {visible.slice(0, limit).map((r) => (
                <button
                  className={`result-card ${r.id === selected ? "is-selected" : ""}`}
                  key={r.id}
                  onClick={() => selectObject(r.id)}
                >
                  <span
                    className="result-period"
                    style={{ color: epochFor(r.epoch).color }}
                  >
                    <span
                      className="period-dot"
                      style={{ background: epochFor(r.epoch).color }}
                    />
                    {r.events.length ? dating(r) : "Дата неизвестна"}
                  </span>
                  <strong>{r.title}</strong>
                  <span className="result-address">
                    {r.address || r.district}
                  </span>
                  <span className="result-bottom">
                    {r.geometryKind === "none" ? (
                      <>Без координат</>
                    ) : r.ensembleId ? (
                      <>
                        <Layers size={12} /> В составе ансамбля
                      </>
                    ) : r.geometryKind === "point" ? (
                      <>
                        <MapPin size={12} /> Точечный объект
                      </>
                    ) : (
                      <>{"Объект наследия"}</>
                    )}
                    <ArrowUpRight size={16} />
                  </span>
                </button>
              ))}
              {visible.length > limit && (
                <button
                  className="load-more"
                  onClick={() => setLimit((n) => n + 40)}
                >
                  Показать ещё 40
                </button>
              )}
            </>
          )}
        </div>
        <footer className="sidebar-footer">
          <span>Открытые данные Москвы</span>
          <a
            href="https://data.mos.ru/opendata/530"
            target="_blank"
            rel="noreferrer"
            aria-label="Открыть реестр Москвы"
          >
            <ArrowUpRight size={16} />
          </a>
        </footer>
      </section>
      <section className="map-area" aria-label="Исторический атлас">
        {manifest && (
          <MapView
            dataBase={dataBase}
            entries={entries}
            visible={visibleIds}
            selected={selected}
            highlight={highlight}
            focus={focus}
            view={view}
            onView={setView}
            onSelect={(id) => selectObject(id, false)}
            onBox={(b) => set("box", b)}
            box={filters.box}
            quarter={filters.quarter}
          />
        )}
        <button
          className="mobile-filter-button"
          onClick={() => setMobileFilters(true)}
        >
          <SlidersHorizontal size={18} /> Найти объект{" "}
          <span>{number(visible.length)}</span>
        </button>
        <div
          ref={timeline}
          className={`timeline ${current ? "with-detail" : ""}`}
        >
          <div className="timeline-top">
            <div>
              <span className="eyebrow">ДАТИРОВКА ОБЪЕКТОВ</span>
              <div className="year-display">
                {filters.from === 1000 && filters.to === 2026
                  ? "Все эпохи"
                  : filters.from === 1000
                    ? `До ${filters.to + 1}`
                    : `${filters.from} — ${filters.to}`}
              </div>
            </div>
            <label className="unknown-toggle">
              <input
                type="checkbox"
                checked={filters.unknown}
                onChange={(e) => set("unknown", e.target.checked)}
              />{" "}
              Включая неизвестные даты
            </label>
            <button
              className="all-time"
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  from: 1000,
                  to: 2026,
                  unknown: true,
                }))
              }
            >
              Все эпохи
            </button>
          </div>
          <YearRange
            entries={entries}
            from={filters.from}
            to={filters.to}
            onChange={(from, to) => setFilters((f) => ({ ...f, from, to }))}
          />
          <div className="epoch-legend">
            {EPOCHS.slice(0, 7).map((e) => (
              <button
                key={e.id}
                className={
                  filters.from === Math.max(1000, e.from) &&
                  filters.to === Math.min(2026, e.to)
                    ? "epoch-active"
                    : ""
                }
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    from: Math.max(1000, e.from),
                    to: Math.min(2026, e.to),
                    unknown: false,
                  }))
                }
              >
                <span style={{ background: e.color }} />
                {e.label}
              </button>
            ))}
            <span className="legend-note">
              <i style={{ background: EPOCHS[7].color }} />
              Несколько дат
            </span>
            <span className="legend-note">
              <i style={{ background: EPOCHS[8].color }} />
              Неизвестно
            </span>
          </div>
          <p className="timeline-note">
            Объекты из реестра · Датировки могут включать перестройки · Не
            реконструкция города на выбранный год
          </p>
        </div>
        {current && (
          <aside className="detail-panel" aria-label="Карточка объекта">
            <div className="detail-heading">
              <span className="eyebrow">ОБЪЕКТ НАСЛЕДИЯ</span>
              <button
                className="icon-btn"
                aria-label="Закрыть карточку"
                onClick={() => setSelected("")}
              >
                <X size={20} />
              </button>
            </div>
            <div
              className="detail-hero"
              style={
                {
                  "--epoch-color": epochFor(current.epoch).color,
                } as React.CSSProperties
              }
            >
              <Landmark size={42} strokeWidth={1} />
              <span>{epochFor(current.epoch).label}</span>
              <h2>{current.title}</h2>
            </div>
            <div className="detail-body">
              <p className="detail-address">
                <MapPin size={16} />
                {current.address}
              </p>
              <div className="dating-box">
                <Clock3 size={17} />
                <div>
                  <strong>{dating(current)}</strong>
                  <p>
                    {current.dateStatus === "unknown"
                      ? "Надёжно извлечь дату из названия не удалось."
                      : current.dateStatus === "multiple"
                        ? "Несколько дат или периодов. Одного года постройки недостаточно."
                        : "Датировка из наименования в реестре."}
                  </p>
                </div>
              </div>
              {detailError ? (
                <p role="alert">{detailError}</p>
              ) : !detail ? (
                <p className="small-muted">Загружаем сведения…</p>
              ) : (
                <>
                  <dl>
                    <Field label="Название по документам">{detail.name}</Field>
                    <Field label="Охранный статус">{detail.protection}</Field>
                    <Field label="Категория">{detail.category}</Field>
                    <Field label="Вид объекта">{detail.type}</Field>
                    <Field label="Район">{detail.district}</Field>
                    {detail.egrkn && (
                      <Field label="Номер ЕГРОКН">
                        <span className="mono">{detail.egrkn}</span>
                      </Field>
                    )}
                  </dl>
                  {detail.events.length > 0 && (
                    <details className="date-details">
                      <summary>Как прочитаны даты</summary>
                      {detail.events.map((e, i) => (
                        <p key={i}>
                          <strong>{e.raw}</strong> · {e.precision}
                          <br />
                          {e.role} ·{" "}
                          {e.from === e.to ? e.from : `${e.from}–${e.to}`}
                        </p>
                      ))}
                    </details>
                  )}
                  {detail.ensembleName && (
                    <div className="ensemble-card">
                      <span className="eyebrow">В СОСТАВЕ АНСАМБЛЯ</span>
                      <h3>{detail.ensembleName}</h3>
                      {detail.ensembleId ? (
                        <button
                          onClick={() => chooseEnsemble(detail.ensembleId)}
                        >
                          Показать участников <ArrowUpRight size={16} />
                        </button>
                      ) : (
                        <p>Связь с другими записями не подтверждена.</p>
                      )}
                    </div>
                  )}
                  <p className="small-muted">
                    {detail.geometryKind === "polygon"
                      ? "Полигон из реестра"
                      : detail.geometryKind === "point"
                        ? "Точечное расположение"
                        : "Координаты отсутствуют в источнике"}
                    {detail.geometrySource === "60562"
                      ? " · Уточнено по адресному реестру"
                      : ""}
                    . Геометрия отражает данные источника и не всегда является
                    контуром отдельного здания.
                  </p>
                  {detail.duplicate && (
                    <p className="data-warning">
                      В исходном реестре есть другая запись с тем же
                      идентификатором. Обе сохранены.
                    </p>
                  )}
                  <a
                    className="source-link"
                    href={detail.source}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть источник <ExternalLink size={15} />
                  </a>
                  <span className="record-id">
                    ID записи: {detail.originalId}
                  </span>
                </>
              )}
            </div>
          </aside>
        )}
      </section>
      <dialog
        ref={about}
        className="about-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) about.current?.close();
        }}
      >
        <div className="about-header">
          <span className="eyebrow">МЕТОДОЛОГИЯ И ИСТОЧНИКИ</span>
          <button
            className="icon-btn"
            aria-label="Закрыть окно о данных"
            onClick={() => about.current?.close()}
          >
            <X />
          </button>
        </div>
        <h2>
          История города.
          <br />
          <em>Без выдуманных дат.</em>
        </h2>
        <p>
          Атлас показывает объекты московского реестра культурного наследия. Он
          не восстанавливает всю застройку Москвы на определённый год.
        </p>
        {counts && (
          <div className="stats-grid">
            <div>
              <strong>{number(counts.total)}</strong>
              <span>записей реестра</span>
            </div>
            <div>
              <strong>{number(counts.polygons)}</strong>
              <span>с полигонами</span>
            </div>
            <div>
              <strong>{number(counts.ensembles)}</strong>
              <span>групп ансамблей</span>
            </div>
            <div>
              <strong>{number(counts.unknown)}</strong>
              <span>без определённой даты</span>
            </div>
          </div>
        )}
        <h3>Как работает время</h3>
        <p>
          Используем датировки из официальных названий: год, диапазон, век или
          часть века. Они могут обозначать строительство, перестройку и другие
          этапы. Связанные с людьми и историческими событиями даты автоматически
          не принимаем за возраст здания.
        </p>
        <p>
          Фильтр проверяет пересечение интервалов. «Начало века» — первые 33
          года, «середина» — следующие 33, «конец» — оставшиеся. Приблизительная
          датировка сохраняется в карточке. Границы цветовых периодов условные.
        </p>
        <h3>Ансамбли и кварталы</h3>
        <p>
          Участники ансамбля сопоставлены по нормализованному названию и
          адресному контексту (УНОМ или улица) при расстоянии до 2 км, либо
          близости до 250 м в одном районе. Это подготовленная связь, которую
          можно уточнить по документам. Даты ансамбля участникам не
          присваиваются.
        </p>
        <p>{manifest?.report.quarterNote}</p>
        <h3>Качество снимка</h3>
        <p>
          {counts
            ? `${number(counts.uniqueSourceIds)} уникальных исходных идентификатора; ${counts.duplicateIdentifiers} идентификатора встречаются повторно. Сохранены все ${number(counts.total)} записей. ${counts.points} записей показаны точками. ${counts.invalidGeometries} некорректных геометрий исключены, пригодные геометрии этих записей сохранены.`
            : ""}
        </p>
        <h3>Источники</h3>
        <ul className="source-list">
          {manifest?.report.sources.map((s) => (
            <li key={s.datasetId}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.datasetId === 530
                  ? "Объекты культурного наследия"
                  : s.datasetId === 60562
                    ? "Адресный реестр недвижимости"
                    : "Учётные городские кварталы"}{" "}
                <ArrowUpRight size={14} />
              </a>
              <span>
                Версия {s.version}.{s.release} · {s.updated.split(" ")[0]}
              </span>
            </li>
          ))}
        </ul>
        <p className="small-muted">
          Обновление выполняется вручную. Подложка: © OpenStreetMap
          contributors. Данные портала — с указанием первоисточника; условия
          доступны на data.mos.ru.
        </p>
        <a
          className="source-link"
          href="https://github.com/shyr1punk/moscow-epochs"
          target="_blank"
          rel="noreferrer"
        >
          Код, исходные данные и отчёт <ArrowUpRight size={16} />
        </a>
      </dialog>
    </main>
  );
}

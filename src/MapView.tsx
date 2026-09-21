import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
maplibregl.setWorkerUrl(workerUrl);
import type {
  Map as GLMap,
  GeoJSONSource,
  FilterSpecification,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import {
  Plus,
  Minus,
  LocateFixed,
  Scan,
  Layers,
  AlertTriangle,
  X,
} from "lucide-react";
import { EPOCHS } from "./dates.mjs";
import type { Entry, View } from "./types";
export default function MapView({
  dataBase,
  entries,
  visible,
  selected,
  highlight,
  focus,
  view,
  onView,
  onSelect,
  onBox,
  box,
  quarter,
}: {
  dataBase: string;
  entries: Entry[];
  visible: string[];
  selected: string;
  highlight: string[];
  focus: Entry | null;
  view: View;
  onView: (v: View) => void;
  onSelect: (id: string) => void;
  onBox: (box: number[] | null) => void;
  box: number[] | null;
  quarter: string;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<GLMap | null>(null);
  const callbacks = useRef({ onSelect, onView, onBox });
  callbacks.current = { onSelect, onView, onBox };
  const [rendered, setRendered] = useState(0);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [basemap, setBasemap] = useState(true),
    [areaMode, setAreaMode] = useState(false),
    [firstCorner, setFirstCorner] = useState(false),
    [quarterVisible, setQuarterVisible] = useState(false);
  const drawing = useRef(false),
    corner = useRef<[number, number] | null>(null);
  const quarterData = useRef<FeatureCollection | null>(null);
  useEffect(() => {
    if (!container.current) return;
    let m: GLMap;
    const controller = new AbortController();
    let alive = true;
    try {
      m = new maplibregl.Map({
        container: container.current,
        center: [view.lng, view.lat],
        zoom: view.zoom,
        minZoom: 8,
        maxZoom: 19,
        attributionControl: { compact: false },
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              maxzoom: 19,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
            },
          },
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#e9eae6" },
            },
            {
              id: "base",
              type: "raster",
              source: "osm",
              paint: {
                "raster-saturation": -0.88,
                "raster-opacity": 0.62,
                "raster-contrast": -0.15,
              },
            },
          ],
        },
      });
      map.current = m;
    } catch {
      setError(
        "Карта недоступна в этом браузере. Поиск и карточки продолжают работать.",
      );
      return;
    }
    m.on("error", (e) => {
      if (!e.error?.message?.includes("tile.openstreetmap"))
        console.error("Map error:", e.error?.message);
      if (
        e.error?.message?.includes("tile") ||
        ("sourceId" in e && e.sourceId === "osm")
      )
        setError(
          "Подложка временно недоступна. Контуры и поиск продолжают работать.",
        );
    });
    m.on("load", async () => {
      try {
        const r = await fetch(`${dataBase}/geometry.geojson`, {
          signal: controller.signal,
        });
        if (!r.ok) throw Error();
        const geo = await r.json();
        if (!alive) return;
        m.addSource("heritage", { type: "geojson", data: geo });
        const colors = [
          "match",
          ["get", "epoch"],
          ...EPOCHS.flatMap((e) => [e.id, e.color]),
          "#a7aeb8",
        ] as unknown as maplibregl.ExpressionSpecification;
        m.addLayer({
          id: "buildings",
          type: "fill",
          source: "heritage",
          filter: ["==", ["get", "kind"], "polygon"],
          paint: { "fill-color": colors, "fill-opacity": 0.62 },
        });
        m.addLayer({
          id: "edges",
          type: "line",
          source: "heritage",
          filter: ["==", ["get", "kind"], "polygon"],
          paint: {
            "line-color": colors,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.6,
              16,
              1.6,
            ],
          },
        });
        m.addLayer({
          id: "points",
          type: "circle",
          source: "heritage",
          filter: ["==", ["get", "kind"], "point"],
          paint: {
            "circle-color": colors,
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              3,
              17,
              6,
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
          },
        });
        m.addLayer({
          id: "highlight",
          type: "line",
          source: "heritage",
          filter: ["==", ["get", "id"], ""],
          paint: { "line-color": "#142333", "line-width": 3 },
        });
        m.addLayer({
          id: "selected-point",
          type: "circle",
          source: "heritage",
          filter: [
            "all",
            ["==", ["get", "kind"], "point"],
            ["==", ["get", "id"], ""],
          ],
          paint: {
            "circle-color": "#fff",
            "circle-radius": 8,
            "circle-stroke-color": "#142333",
            "circle-stroke-width": 3,
          },
        });
        m.addSource("selection", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        m.addLayer({
          id: "selection-fill",
          type: "fill",
          source: "selection",
          paint: { "fill-color": "#3d70b7", "fill-opacity": 0.08 },
        });
        m.addLayer({
          id: "selection-line",
          type: "line",
          source: "selection",
          paint: {
            "line-color": "#284f85",
            "line-width": 2,
            "line-dasharray": [3, 2],
          },
        });
        setReady(true);
      } catch (e) {
        if (alive)
          setError(
            "Не удалось загрузить контуры. Обновите страницу; список объектов доступен.",
          );
      }
    });
    m.on("render", () => {
      if (m.getLayer("buildings")) {
        const count = m.queryRenderedFeatures({
          layers: ["buildings", "points"],
        }).length;
        setRendered((previous) => (previous === count ? previous : count));
      }
    });
    m.on("moveend", () => {
      const c = m.getCenter();
      callbacks.current.onView({ lng: c.lng, lat: c.lat, zoom: m.getZoom() });
    });
    m.on("click", (e) => {
      if (drawing.current) {
        const p: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        if (!corner.current) {
          corner.current = p;
          setFirstCorner(true);
        } else {
          const a = corner.current;
          const b = [
            Math.min(a[0], p[0]),
            Math.min(a[1], p[1]),
            Math.max(a[0], p[0]),
            Math.max(a[1], p[1]),
          ];
          if (b[0] !== b[2] && b[1] !== b[3]) callbacks.current.onBox(b);
          corner.current = null;
          drawing.current = false;
          setAreaMode(false);
          setFirstCorner(false);
          m.getCanvas().style.cursor = "";
        }
        return;
      }
      if (!m.getLayer("buildings")) return;
      const hits = m.queryRenderedFeatures(e.point, {
        layers: ["buildings", "points"],
      });
      if (hits.length)
        callbacks.current.onSelect(String(hits[0].properties.id));
    });
    m.on("mousemove", (e) => {
      if (drawing.current) {
        m.getCanvas().style.cursor = "crosshair";
        return;
      }
      if (!m.getLayer("buildings")) return;
      m.getCanvas().style.cursor = m.queryRenderedFeatures(e.point, {
        layers: ["buildings", "points"],
      }).length
        ? "pointer"
        : "";
    });
    return () => {
      alive = false;
      controller.abort();
      m.remove();
      map.current = null;
    };
  }, [dataBase]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const membership: FilterSpecification = [
      "in",
      ["get", "id"],
      ["literal", visible],
    ];
    m.setFilter("buildings", [
      "all",
      ["==", ["get", "kind"], "polygon"],
      membership,
    ]);
    m.setFilter("edges", [
      "all",
      ["==", ["get", "kind"], "polygon"],
      membership,
    ]);
    m.setFilter("points", [
      "all",
      ["==", ["get", "kind"], "point"],
      membership,
    ]);
    m.setFilter("highlight", [
      "in",
      ["get", "id"],
      [
        "literal",
        (selected ? [selected, ...highlight] : highlight).filter((id) =>
          visible.includes(id),
        ),
      ],
    ]);
    m.setFilter("selected-point", [
      "all",
      ["==", ["get", "kind"], "point"],
      ["==", ["get", "id"], selected],
    ]);
  }, [ready, visible, selected, highlight]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !focus?.bounds) return;
    m.fitBounds(
      [
        [focus.bounds[0], focus.bounds[1]],
        [focus.bounds[2], focus.bounds[3]],
      ],
      {
        padding: {
          top: 100,
          bottom: 190,
          left: 80,
          right: window.innerWidth > 1000 ? 400 : 80,
        },
        maxZoom: 17,
        duration: 850,
      },
    );
  }, [focus, ready]);
  useEffect(() => {
    if (ready)
      map.current?.setPaintProperty(
        "base",
        "raster-opacity",
        basemap ? 0.62 : 0,
      );
  }, [basemap, ready]);
  useEffect(() => {
    if (!ready) return;
    const data: FeatureCollection = {
      type: "FeatureCollection",
      features: box
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [box[0], box[1]],
                    [box[2], box[1]],
                    [box[2], box[3]],
                    [box[0], box[3]],
                    [box[0], box[1]],
                  ],
                ],
              },
            },
          ]
        : [],
    };
    (map.current?.getSource("selection") as GeoJSONSource)?.setData(data);
  }, [box, ready]);
  useEffect(() => {
    if (!ready || (!quarterVisible && !quarter)) return;
    let alive = true;
    async function load() {
      try {
        const m = map.current!;
        if (!quarterData.current) {
          const r = await fetch(`${dataBase}/quarters.geojson`);
          if (!r.ok) throw Error();
          quarterData.current = await r.json();
        }
        if (!alive) return;
        if (!m.getSource("quarters")) {
          m.addSource("quarters", {
            type: "geojson",
            data: quarterData.current!,
          });
          m.addLayer({
            id: "quarter-lines",
            type: "line",
            source: "quarters",
            paint: {
              "line-color": "#465365",
              "line-width": 1.4,
              "line-dasharray": [4, 3],
            },
          });
        }
        m.setLayoutProperty("quarter-lines", "visibility", "visible");
        m.setFilter(
          "quarter-lines",
          quarter ? ["==", ["get", "id"], quarter] : null,
        );
      } catch {
        if (alive) setError("Не удалось загрузить границы кварталов.");
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [ready, quarterVisible, quarter, dataBase]);
  useEffect(() => {
    if (
      ready &&
      map.current?.getLayer("quarter-lines") &&
      !quarterVisible &&
      !quarter
    )
      map.current.setLayoutProperty("quarter-lines", "visibility", "none");
  }, [ready, quarterVisible, quarter]);
  const toggleArea = () => {
    drawing.current = !drawing.current;
    corner.current = null;
    setFirstCorner(false);
    setAreaMode(drawing.current);
    if (map.current)
      map.current.getCanvas().style.cursor = drawing.current ? "crosshair" : "";
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawing.current) toggleArea();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  return (
    <div
      className="map-wrap"
      data-map-ready={ready}
      data-rendered-objects={rendered}
    >
      <div
        ref={container}
        className="map-canvas"
        role="region"
        aria-label="Карта исторических объектов Москвы"
      />
      {!ready && !error && (
        <div className="map-loading">
          <span className="spinner" /> Загружаем контуры Москвы…
        </div>
      )}
      <div className="map-tools">
        <button
          title="Приблизить"
          aria-label="Приблизить"
          onClick={() => map.current?.zoomIn()}
        >
          <Plus size={20} />
        </button>
        <button
          title="Отдалить"
          aria-label="Отдалить"
          onClick={() => map.current?.zoomOut()}
        >
          <Minus size={20} />
        </button>
        <span />
        <button
          title="Вернуться к центру Москвы"
          aria-label="Вернуться к центру Москвы"
          onClick={() =>
            map.current?.flyTo({ center: [37.6185, 55.752], zoom: 12.2 })
          }
        >
          <LocateFixed size={20} />
        </button>
        <button
          aria-label="Выделить область"
          title="Выделить область двумя кликами"
          aria-pressed={areaMode}
          className={areaMode ? "active" : ""}
          onClick={toggleArea}
        >
          <Scan size={20} />
        </button>
        <button
          title="Границы учётных кварталов"
          aria-label="Границы учётных кварталов"
          aria-pressed={quarterVisible}
          className={quarterVisible ? "active" : ""}
          onClick={() => setQuarterVisible((v) => !v)}
        >
          <Layers size={20} />
        </button>
      </div>
      <div className="map-caption">
        <span className="live-mark" /> МОСКВА{" "}
        <span className="caption-divider" /> КАРТА НАСЛЕДИЯ
      </div>
      <button
        className="basemap-toggle"
        aria-pressed={basemap}
        onClick={() => setBasemap((v) => !v)}
      >
        {basemap ? "Убрать подложку" : "Показать подложку"}
      </button>
      {areaMode && (
        <div className="map-notice">
          {firstCorner
            ? "Укажите противоположный угол области"
            : "Укажите первый угол области"}
          <button aria-label="Отменить выделение" onClick={toggleArea}>
            <X size={16} />
          </button>
        </div>
      )}
      {error && (
        <div className="map-error" role="status">
          <AlertTriangle size={16} />
          {error}
          <button aria-label="Закрыть сообщение" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <span className="sr-only">
        {entries.length} записей доступны через список слева.
      </span>
    </div>
  );
}

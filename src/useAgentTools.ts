import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import type { Entry, Filters } from "./types";
import { matches } from "./filter.mjs";
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type Context = {
  registerTool: (t: Tool, o: { signal: AbortSignal }) => void | Promise<void>;
};
export function useAgentTools(
  entries: Entry[],
  filters: Filters,
  setFilters: (f: Filters) => void,
  select: (id: string) => void,
) {
  const state = useRef({ entries, filters, setFilters, select });
  state.current = { entries, filters, setFilters, select };
  useEffect(() => {
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: "read_heritage_results",
        description:
          "Read up to 50 objects matching the visible atlas filters, plus the total count.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => {
          const s = state.current;
          const result = s.entries.filter((r) => matches(r, s.filters));
          return {
            total: result.length,
            objects: result
              .slice(0, 50)
              .map((r) => ({ id: r.id, name: r.name, address: r.address })),
          };
        },
      },
      {
        name: "set_heritage_search",
        description:
          "Set the visible atlas text search. Other filters remain unchanged.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string", maxLength: 300 } },
          required: ["query"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: (input) => {
          const q = (input as { query?: unknown })?.query;
          if (typeof q !== "string" || q.length > 300)
            throw Error("query must be a string up to 300 characters");
          const s = state.current;
          const f = { ...s.filters, q };
          flushSync(() => s.setFilters(f));
          return {
            query: q,
            total: s.entries.filter((r) => matches(r, f)).length,
          };
        },
      },
      {
        name: "open_heritage_object",
        description:
          "Open an existing object card and focus its geometry on the map.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: (input) => {
          const id = (input as { id?: unknown })?.id;
          const r = state.current.entries.find((r) => r.id === id);
          if (!r) throw Error("Unknown object identifier");
          flushSync(() => state.current.select(r.id));
          return { id: r.id, name: r.name };
        },
      },
    ];
    for (const t of tools)
      try {
        void Promise.resolve(
          context.registerTool(t, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Browsers without this optional API keep the normal interface. */
      }
    return () => lifecycle.abort();
  }, []);
}

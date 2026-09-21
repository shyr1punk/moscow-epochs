export type Dating = {
  from: number;
  to: number;
  precision: string;
  role: string;
  raw: string;
};
export type Entry = {
  id: string;
  duplicate: boolean;
  title: string;
  name: string;
  address: string;
  district: string;
  districts: string[];
  category: string;
  ensembleId: string;
  ensembleName: string;
  epoch: string;
  events: Dating[];
  dateStatus: string;
  center: [number, number] | null;
  bounds: [number, number, number, number] | null;
  geometryKind: string;
  chunk: number;
  quarterIds: string[];
};
export type Detail = Entry & {
  originalId: string;
  protection: string;
  type: string;
  egrkn: string;
  aisid: string;
  unoms: number[];
  source: string;
  geometrySource: string;
  addressMatches: { unom: number; address: string }[];
};
export type Ensemble = {
  id: string;
  name: string;
  count: number;
  members: string[];
};
export type Quarter = {
  id: string;
  name: string;
  district: string;
  count: number;
  bounds: [number, number, number, number];
};
export type Manifest = {
  snapshot: string;
  report: {
    generatedAt: string;
    counts: Record<string, number>;
    sources: {
      datasetId: number;
      url: string;
      version: number;
      release: number;
      updated: string;
      records: number;
      sha256: string;
    }[];
    quarterNote: string;
  };
};
export type View = { lng: number; lat: number; zoom: number };
export type Filters = {
  q: string;
  district: string;
  category: string;
  ensemble: string;
  quarter: string;
  from: number;
  to: number;
  unknown: boolean;
  box: number[] | null;
};

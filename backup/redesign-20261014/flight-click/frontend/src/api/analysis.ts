import { api } from './client';

export interface Extent { first: string | null; last: string | null; flights: number }
export interface WindowLimit { min: number; max: number; default: number }
export type PlotKind = 'retraction' | 'extension' | 'landing';

export interface Meta {
  extent: Extent;
  aircraft: number[];
  windows: Record<PlotKind, { before: WindowLimit; after: WindowLimit }>;
}

export interface StatCard {
  param: string;
  title: string;
  kind: string;
  unit: string | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  flights: number;
}
export interface StatsResponse { flights: number; cards: StatCard[] }

export interface FlightRow {
  flight_id: number;
  aircraft_number: number | null;
  flight_number: number | null;
  date: string | null;
  start: string | null;
}
export interface FlightList { flights: FlightRow[]; dates: string[]; flight_numbers: number[] }

export interface Trigger { seq: number; time: number | null; complete: boolean }
export interface TriggerList { kind: PlotKind; base_date: string; triggers: Trigger[] }

export type Series = [number, number | null][];
export interface Value { value: number | null; unit: string | null; complete: boolean }

export interface Step { n: number; name: string; t: number | null }
export interface Panel {
  door: 'NOSE' | 'RH' | 'LH';
  complete: boolean;
  door_time: number | null;
  gear_time: number | null;
  steps: Step[];
  missing: string | null;
  signals: {
    gear_uplock: Series;
    gear_downlock: Series;
    door_uplock: Series;
    door_open_limit: Series;
  };
}
export interface WindowInfo { start: number; end: number; before: number; after: number }
export interface CycleResponse {
  kind: 'retraction' | 'extension';
  seq: number;
  base_date: string;
  trigger_time: number;
  window: WindowInfo;
  total: Value | null;
  complete: boolean;
  panels: Panel[];
}

export interface LandingResponse {
  seq: number;
  base_date: string;
  touchdown: number;
  chute_select: number | null;
  ten_kt: number | null;
  has_chute: boolean;
  window: WindowInfo;
  values: Record<'sink_rate' | 'chute_speed' | 'roll_distance' | 'max_nx' | 'avg_nx' | 'max_nz' | 'landing_mass', Value | null>;
  signals: {
    wheel_speed: Series;
    ground_speed: Series;
    nx: Series;
    chute_select: Series;
    vertical_velocity: Series;
  };
}

export type TrendView = 'extension_total' | 'retraction_total' | 'retraction_gear' | 'extension_gear';
export type TrendGroup = 'day' | 'week' | 'month';
export interface Bucket { start: string; avg: number | null; min: number | null; max: number | null; n: number }
export interface TrendPlot { param: string; title: string; unit: string; buckets: Bucket[] }
export interface TrendResponse {
  flights: number;
  from: string | null;
  to: string | null;
  group: TrendGroup;
  plots: TrendPlot[];
}

function qs(params: Record<string, string | number | null | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

export const analysisApi = {
  meta: () => api.get<Meta>('/analysis/meta'),
  stats: (from?: string | null, to?: string | null, aircraft?: number | null) =>
    api.get<StatsResponse>(`/analysis/stats${qs({ from, to, aircraft })}`),
  flights: (f: { aircraft?: number | null; flight_number?: number | null; date?: string | null; from?: string | null; to?: string | null }) =>
    api.get<FlightList>(`/analysis/flights${qs(f)}`),
  triggers: (flightId: number, kind: PlotKind) =>
    api.get<TriggerList>(`/analysis/flights/${flightId}/triggers${qs({ kind })}`),
  cycle: (flightId: number, kind: 'retraction' | 'extension', seq: number, before: number, after: number) =>
    api.get<CycleResponse>(`/analysis/flights/${flightId}/cycle${qs({ kind, seq, before, after })}`),
  landing: (flightId: number, seq: number, before: number, after: number) =>
    api.get<LandingResponse>(`/analysis/flights/${flightId}/landing${qs({ seq, before, after })}`),
  trend: (view: TrendView, group: TrendGroup, from?: string | null, to?: string | null, aircraft?: number | null) =>
    api.get<TrendResponse>(`/analysis/trend${qs({ view, group, from, to, aircraft })}`),
};

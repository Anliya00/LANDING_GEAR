import { api } from './client';

export interface FlightRow {
  flight_id: number;
  aircraft_id: number;
  aircraft_number: number | null;
  flight_number: number;
  flight_date_time: string | null;
  configured_mass_kg: number | null;
  initial_fuel_kg: number | null;
  initial_mass_kg: number | null;
  upload_start_time: string | null;
  upload_end_time: string | null;
  status: string;
  error_message: string | null;
}

export interface KpiMetric {
  key: string;
  title: string;
  value: number | null;
  unit: string;
  limit_status: 'within' | 'near' | 'exceed' | 'na';
  limit_text: string;
  benchmark?: string | null;
}

export interface TimelinePhase {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  start_sec: number;
  end_sec: number;
  duration_min: number;
  color: string;
}

export interface SignalPoint {
  t: number;
  clock: string;
  airspeed: number | null;
  altitude: number | null;
  brake_pressure: number | null;
  gear_position: number | null;
  ng_position?: number | null;
  lh_mlg_position?: number | null;
  rh_mlg_position?: number | null;
}

export interface FlightParamItem {
  param_name: string;
  description: string | null;
  value: number | null;
  unit: string | null;
  status: number;
  status_label: string;
}

export interface FlightEventItem {
  event_name: string;
  date_time: string | null;
  occur_seq: number | null;
}

export interface FlightSummaryResponse {
  flight: FlightRow;
  kpis: KpiMetric[];
  total_duration_minutes: number;
  timeline_phases: TimelinePhase[];
  key_signals: {
    points: SignalPoint[];
    has_real_signals: boolean;
  };
  parameters: FlightParamItem[];
  events: FlightEventItem[];
}

export const flightsApi = {
  list: () => api.get<FlightRow[]>('/flights'),
  getSummary: (flightId: number) => api.get<FlightSummaryResponse>(`/flights/${flightId}/summary`),
};

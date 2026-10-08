import { api } from './client';

export interface Aircraft {
  aircraft_id: number;
  aircraft_number: number;
  aircraft_mass_kg: number | null;
  modified: string | null;
  flight_count: number;
}

export interface AircraftCreate {
  aircraft_number: number;
  aircraft_mass_kg: number | null;
}

export interface AircraftUpdate {
  aircraft_mass_kg: number | null;
}

export const aircraftApi = {
  list: () => api.get<Aircraft[]>('/aircrafts'),
  create: (data: AircraftCreate) => api.post<Aircraft>('/aircrafts', data),
  update: (id: number, data: AircraftUpdate) => api.put<Aircraft>(`/aircrafts/${id}`, data),
  delete: (id: number) => api.delete<void>(`/aircrafts/${id}`),
};

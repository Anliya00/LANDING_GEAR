import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '@/api/client';


export type FlightStatus =
  | 'discovered' | 'validated' | 'blocked' | 'queued'
  | 'converting' | 'computing' | 'complete' | 'failed';

export interface FlightIdentity {
  tail: string;          // AC1234
  flightNo: string;      // 0001
  declaredDate: string;  // 01072026, as written by whoever made the folder
  key: string;           // AC1234_0001_01072026
  status: FlightStatus;
  statusRemark: string | null;
}

interface FlightCtx {
  flight: FlightIdentity | null;
  loading: boolean;
  error: string | null;
}

const Ctx = createContext<FlightCtx>({ flight: null, loading: false, error: null });
const LAST_KEY = 'sftad.lastFlight';

export function FlightProvider({ children }: { children: ReactNode }) {
  const { tail, flightNo } = useParams();
  const [state, setState] = useState<FlightCtx>({
    flight: null, loading: true, error: null,
  });

  useEffect(() => {
    if (!tail || !flightNo) {
      setState({ flight: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ flight: null, loading: true, error: null });

        api
      .get<FlightIdentity>(`/flights/${tail}/${flightNo}`)
      .then((f) => {
        if (cancelled) return;
        sessionStorage.setItem(LAST_KEY, `${tail}/${flightNo}`);
        setState({ flight: f, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError && err.status === 404
            ? 'Flight not found'
            : err instanceof ApiError
              ? err.message
              : 'Could not load this flight';
        setState({ flight: null, loading: false, error: message });
      });

    return () => { cancelled = true; };
  }, [tail, flightNo]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useFlight = () => useContext(Ctx);

/** Last flight visited this session — lets the sidebar's Analysis and Events
 *  entries stay useful after a trip to Home. Session-scoped on purpose: a new
 *  tab starts clean rather than inheriting a stale flight. */
export const lastFlightPath = () => sessionStorage.getItem(LAST_KEY);
/**
 * Custom icons, one per statistics card (the `kind` the API sends with each).
 * Drawn on a 24x24 grid with a 1.8 stroke in currentColor, so they take the
 * card's tone (blue or orange) and work in light and dark themes.
 */
import type { ReactNode } from 'react';

const ART: Record<string, ReactNode> = {
  // gear leg: strut, wheel with hub; arrow shows the direction of travel
  extension: (
    <>
      <path d="M10 2.5v8.5" /><circle cx="10" cy="16" r="4.6" /><circle cx="10" cy="16" r="1.2" />
      <path d="M19 5v8M16 10.5l3 3 3-3" />
    </>
  ),
  retraction: (
    <>
      <path d="M10 2.5v8.5" /><circle cx="10" cy="16" r="4.6" /><circle cx="10" cy="16" r="1.2" />
      <path d="M19 13V5M16 7.5l3-3 3 3" />
    </>
  ),
  // weight block: up arrow at take-off, down arrow at landing
  mass_up: (
    <>
      <circle cx="10" cy="5.2" r="2.2" /><path d="M6.2 9h7.6l2 11H4.2z" />
      <path d="M20 12V4M17.5 6.5L20 4l2.5 2.5" />
    </>
  ),
  mass_down: (
    <>
      <circle cx="10" cy="5.2" r="2.2" /><path d="M6.2 9h7.6l2 11H4.2z" />
      <path d="M20 4v8M17.5 9.5L20 12l2.5-2.5" />
    </>
  ),
  // sink rate: descending path arriving at the ground
  sink: (
    <>
      <path d="M4 4.5l12.5 11M17.5 9.5v7h-7" /><path d="M3.5 20.5h17" />
    </>
  ),
  // Nx: pulse with its peak marked / its mean marked
  nx_max: (
    <>
      <path d="M2.5 16h5l2.6-10.5 3.2 14 2.2-3.5h6" /><path d="M2.5 3.5h19" strokeDasharray="2 2.5" />
    </>
  ),
  nx_avg: (
    <>
      <path d="M2.5 12c2-6.5 4-6.5 6 0s4 6.5 6 0 4-6.5 6 0" /><path d="M2.5 12h19" strokeDasharray="2 2.5" />
    </>
  ),
  // landing roll distance: runway in perspective with a distance span
  runway: (
    <>
      <path d="M8.5 3L4 21M15.5 3L20 21" /><path d="M12 5v3M12 11v3M12 17v3" />
    </>
  ),
  // drag chute: canopy, risers, and the load
  chute: (
    <>
      <path d="M3 11a9 8 0 0 1 18 0z" /><path d="M3 11l9 9.5M21 11l-9 9.5M9 11l3 9.5M15 11l-3 9.5" /><circle cx="12" cy="21.3" r="1" />
    </>
  ),
  // Nz: vertical load, up for take-off roll, down for landing roll
  nz_up: (
    <>
      <path d="M12 18V4M7 9l5-5 5 5" /><path d="M4.5 21h15" /><path d="M18 11h3.5M18 15h3.5" />
    </>
  ),
  nz_down: (
    <>
      <path d="M12 3v14M7 12l5 5 5-5" /><path d="M4.5 21h15" /><path d="M4 18l2 2M20 18l-2 2" />
    </>
  ),
};

/** Fallback for a parameter kind without its own drawing: a plain gauge dial. */
const FALLBACK = (
  <>
    <path d="M3.5 17a8.5 8.5 0 1 1 17 0" /><path d="M12 17l4-5" /><circle cx="12" cy="17" r="1.3" />
  </>
);

export function ParamIcon({ kind, size = 26 }: { kind: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ART[kind] ?? FALLBACK}
    </svg>
  );
}

export const PARAM_TONE: Record<string, 'blue' | 'orange'> = {
  extension: 'blue', retraction: 'blue', mass_up: 'blue', mass_down: 'blue', nx_avg: 'blue', runway: 'blue',
  sink: 'orange', nx_max: 'orange', chute: 'orange', nz_up: 'orange', nz_down: 'orange',
};

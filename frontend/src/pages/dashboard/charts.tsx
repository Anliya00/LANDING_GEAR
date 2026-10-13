import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fmtClock, fmtNum, monthName } from './format';

/** Series colours. Fixed, not theme tokens: a line keeps its meaning in both themes. */
export const COLORS = {
  purple: '#6d4fd6',
  blue: '#2f6fe4',
  green: '#14a37f',
  orange: '#f26a3d',
  red: '#e5484d',
  slate: '#64748b',
};

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.floor(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** A "nice" step (1, 2, 5 x 10^n) giving roughly `count` intervals over `span`. */
function niceStep(span: number, count: number): number {
  if (span <= 0 || !Number.isFinite(span)) return 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const f = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return f * mag;
}

function niceTicks(lo: number, hi: number, count = 5): number[] {
  const step = niceStep(hi - lo, count);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  }
  return out;
}

const CLOCK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800, 3600];
function clockTicks(lo: number, hi: number, target = 6): number[] {
  const span = hi - lo;
  const step = CLOCK_STEPS.find((s) => span / s <= target) ?? 3600;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

/* ===========================================================================
   LineChart — the Trend fold. A true time scale, three lines, break at gaps.
   =========================================================================== */

export interface LineSeries {
  name: string;
  color: string;
  values: (number | null)[];
}

export function LineChart({
  title, unit, xs, series, limit, height = 250, tip,
}: {
  title: string;
  unit: string;
  /** x position of each bucket, epoch milliseconds */
  xs: number[];
  series: LineSeries[];
  limit: number | null;
  height?: number;
  tip?: (index: number) => string[];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 54, r: 18, t: 12, b: 30 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;

  const { y0, y1, yTicks } = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
    if (limit !== null) all.push(limit);
    const hi = all.length ? Math.max(...all) : 1;
    const lo = all.length ? Math.min(...all) : 0;
    const floor = lo >= 0 ? 0 : lo;
    const ticks = niceTicks(floor, hi, 5);
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
    if ((ticks[ticks.length - 1] ?? 0) < hi) ticks.push(Number(((ticks[ticks.length - 1] ?? 0) + step).toPrecision(12)));
    return { y0: floor, y1: ticks[ticks.length - 1] ?? hi, yTicks: ticks };
  }, [series, limit]);

  const xMin = xs[0] ?? 0;
  const xMax = xs[xs.length - 1] ?? 1;
  const sx = (x: number) => m.l + (xMax === xMin ? iw / 2 : ((x - xMin) / (xMax - xMin)) * iw);
  const sy = (y: number) => m.t + ih - ((y - y0) / (y1 - y0 || 1)) * ih;

  const spanDays = (xMax - xMin) / 86_400_000;
  const ticks = useMemo(() => {
    const n = Math.min(8, Math.max(2, xs.length));
    return Array.from({ length: n }, (_, i) => xMin + ((xMax - xMin) * i) / (n - 1));
  }, [xs.length, xMin, xMax]);
  const label = (ms: number) => {
    const d = new Date(ms);
    return spanDays <= 90
      ? `${d.getUTCDate()} ${monthName(d.getUTCMonth())}`
      : `${monthName(d.getUTCMonth())} ${String(d.getUTCFullYear()).slice(2)}`;
  };

  const paths = series.map((s) => {
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    let best = 0;
    let dist = Infinity;
    xs.forEach((x, i) => {
      const d = Math.abs(sx(x) - px);
      if (d < dist) { dist = d; best = i; }
    });
    setHover(best);
  }

  return (
    <div className="dash-plot" ref={ref}>
      {title && <div className="dash-plot-title">{title}</div>}
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={title}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={width - m.r} y1={sy(v)} y2={sy(v)} className="chart-grid" />
            <text x={m.l - 8} y={sy(v) + 4} textAnchor="end" className="chart-tick">{fmtNum(v, v % 1 ? 1 : 0)}</text>
          </g>
        ))}
        <text transform={`translate(14 ${m.t + ih / 2}) rotate(-90)`} textAnchor="middle" className="chart-axis-title">{unit}</text>
        {ticks.map((t, i) => (
          <text key={t} x={sx(t)} y={height - 8} textAnchor={i === ticks.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} className="chart-tick">{label(t)}</text>
        ))}
        {limit !== null && (
          <line x1={m.l} x2={width - m.r} y1={sy(limit)} y2={sy(limit)} stroke={COLORS.slate} strokeDasharray="6 5" strokeWidth={1.5} />
        )}
        {series.map((s, i) => (
          <g key={s.name}>
            <path d={paths[i]} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" opacity={0.9} />
            {s.values.map((v, j) => v === null ? null : (
              <circle key={j} cx={sx(xs[j])} cy={sy(v)} r={xs.length > 120 ? 1.8 : 3} fill={s.color} />
            ))}
          </g>
        ))}
        {hover !== null && (
          <line x1={sx(xs[hover])} x2={sx(xs[hover])} y1={m.t} y2={m.t + ih} className="chart-cursor" />
        )}
      </svg>
      {hover !== null && tip && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(sx(xs[hover]) + 12, 8), width - 190), top: 40 }}>
          {tip(hover).map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
   SignalStack — rows of signals on one shared clock-time axis.
   Used for the cycle panels (four 0/1 rows) and the landing roll (analog rows).
   =========================================================================== */

export interface SignalLine {
  name: string;
  color: string;
  dashed?: boolean;
  points: [number, number | null][];
}
export interface SignalRow {
  label: string;
  kind: 'binary' | 'analog';
  lines: SignalLine[];
  unit?: string;
  /** analog rows: [min, max] to pin the scale */
  domain?: [number, number];
  height?: number;
}
export interface Marker { t: number; label: string; color: string }

function valueAt(points: [number, number | null][], t: number, step: boolean): number | null {
  if (!points.length || t < points[0][0] || t > points[points.length - 1][0]) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid][0] <= t) lo = mid; else hi = mid - 1;
  }
  if (step || lo === points.length - 1) return points[lo][1];
  const [t0, v0] = points[lo];
  const [t1, v1] = points[lo + 1];
  if (v0 === null || v1 === null) return v0;
  return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0 || 1);
}

export function SignalStack({
  rows, xMin, xMax, markers = [], showAxis = true, labelWidth = 118,
}: {
  rows: SignalRow[];
  xMin: number;
  xMax: number;
  markers?: Marker[];
  showAxis?: boolean;
  labelWidth?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverT, setHoverT] = useState<number | null>(null);
  const m = { l: labelWidth, r: 14, t: 6, b: showAxis ? 26 : 6 };
  const gap = 4;
  const heights = rows.map((r) => r.height ?? (r.kind === 'binary' ? 38 : 84));
  const total = m.t + m.b + heights.reduce((a, b) => a + b, 0) + gap * (rows.length - 1);
  const iw = width - m.l - m.r;
  const sx = (t: number) => m.l + ((t - xMin) / (xMax - xMin || 1)) * iw;
  const tickList = useMemo(() => clockTicks(xMin, xMax), [xMin, xMax]);

  const geometry = useMemo(() => {
    let y = m.t;
    return rows.map((r, i) => {
      const top = y;
      y += heights[i] + gap;
      let lo = 0;
      let hi = 1;
      if (r.kind === 'analog') {
        if (r.domain) [lo, hi] = r.domain;
        else {
          const vals = r.lines.flatMap((l) => l.points.map((p) => p[1])).filter((v): v is number => v !== null);
          lo = vals.length ? Math.min(...vals) : 0;
          hi = vals.length ? Math.max(...vals) : 1;
          const pad = (hi - lo || 1) * 0.08;
          lo -= pad; hi += pad;
        }
      } else { lo = -0.12; hi = 1.12; }
      return { top, h: heights[i], lo, hi };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, width]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    if (px < m.l || px > width - m.r) { setHoverT(null); return; }
    setHoverT(xMin + ((px - m.l) / iw) * (xMax - xMin));
  }

  const pathFor = (line: SignalLine, g: { top: number; h: number; lo: number; hi: number }, step: boolean) => {
    const y = (v: number) => g.top + g.h - ((v - g.lo) / (g.hi - g.lo || 1)) * g.h;
    let d = '';
    let pen = false;
    let prevY = 0;
    for (const [t, v] of line.points) {
      if (v === null || t < xMin || t > xMax) { pen = false; continue; }
      const px = sx(t).toFixed(1);
      const py = y(v);
      if (!pen) d += `M${px},${py.toFixed(1)}`;
      else if (step) d += `H${px}V${py.toFixed(1)}`;
      else d += `L${px},${py.toFixed(1)}`;
      pen = true;
      prevY = py;
    }
    void prevY;
    return d;
  };

  return (
    <div className="dash-stack" ref={ref}>
      <svg width={width} height={total} onMouseMove={onMove} onMouseLeave={() => setHoverT(null)}>
        {rows.map((r, i) => {
          const g = geometry[i];
          const step = r.kind === 'binary';
          const y = (v: number) => g.top + g.h - ((v - g.lo) / (g.hi - g.lo || 1)) * g.h;
          return (
            <g key={r.label + i}>
              <rect x={m.l} y={g.top} width={iw} height={g.h} className="chart-band" rx={3} />
              <text x={m.l - 12} y={g.top + g.h / 2 + 4} textAnchor="end" className="chart-row-label">{r.label}</text>
              {step ? (
                <>
                  <text x={m.l - 3} y={y(1) + 3} textAnchor="end" className="chart-tick-sm">1</text>
                  <text x={m.l - 3} y={y(0) + 3} textAnchor="end" className="chart-tick-sm">0</text>
                </>
              ) : (
                <>
                  <text x={m.l - 3} y={g.top + 9} textAnchor="end" className="chart-tick-sm">{fmtNum(g.hi - (g.hi - g.lo) * 0.04)}</text>
                  <text x={m.l - 3} y={g.top + g.h - 2} textAnchor="end" className="chart-tick-sm">{fmtNum(g.lo + (g.hi - g.lo) * 0.04)}</text>
                </>
              )}
              {r.lines.map((l) => (
                <path key={l.name} d={pathFor(l, g, step)} fill="none" stroke={l.color}
                  strokeWidth={step ? 2 : 1.8} strokeDasharray={l.dashed ? '5 4' : undefined} strokeLinejoin="round" />
              ))}
            </g>
          );
        })}

        {markers.map((mk, mi) => mk.t >= xMin && mk.t <= xMax && (
          <g key={mk.label}>
            <line x1={sx(mk.t)} x2={sx(mk.t)} y1={m.t} y2={total - m.b} stroke={mk.color} strokeDasharray="3 3" strokeWidth={1.2} opacity={0.8} />
            <text x={sx(mk.t) + 4} y={m.t + 10 + mi * 12} className="chart-marker" fill={mk.color}>{mk.label}</text>
          </g>
        ))}

        {showAxis && tickList.map((t) => (
          <text key={t} x={sx(t)} y={total - 8} textAnchor="middle" className="chart-tick">{fmtClock(t, t % 1 ? 1 : 0)}</text>
        ))}

        {hoverT !== null && <line x1={sx(hoverT)} x2={sx(hoverT)} y1={m.t} y2={total - m.b} className="chart-cursor" />}
      </svg>

      {hoverT !== null && (
        <div className="chart-tip" style={{ left: Math.min(sx(hoverT) + 12, width - 200), top: 8 }}>
          <div className="chart-tip-time">{fmtClock(hoverT, 2)}</div>
          {rows.flatMap((r) => r.lines.map((l) => {
            const v = valueAt(l.points, hoverT, r.kind === 'binary');
            return (
              <div key={r.label + l.name}>
                <span className="chart-swatch" style={{ background: l.color }} />
                {l.name}: <b>{v === null ? '—' : r.kind === 'binary' ? v : fmtNum(v)}</b>
              </div>
            );
          }))}
        </div>
      )}
    </div>
  );
}

/** Keyboard-safe hook for closing popovers on outside click / Escape. */
export function useDismiss(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key); };
  }, [open, onClose, ref]);
}

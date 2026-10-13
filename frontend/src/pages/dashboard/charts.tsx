import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fmtClock, fmtNum } from './format';

/** Series colours. Fixed, not theme tokens: a line keeps its meaning in both themes. */
export const COLORS = {
  purple: '#6d4fd6',
  blue: '#2f6fe4',
  green: '#14a37f',
  orange: '#f26a3d',
  red: '#e5484d',
  slate: '#64748b',
};

/* ===========================================================================
   Plotly wrapper.

   All dashboard plots are drawn by Plotly (cartesian bundle, ~1 MB minified).
   It is loaded on first use as its own chunk, so the rest of the app does not
   pay for it. Plotly gives every chart: hover read-out, box zoom, pan, double
   click to reset, legend toggling and a "download as PNG" button.
   =========================================================================== */

export interface Theme {
  ink: string;
  muted: string;
  faint: string;
  grid: string;
  sunken: string;
  raised: string;
  font: string;
}

function readTheme(el: HTMLElement): Theme {
  const cs = getComputedStyle(el);
  const g = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    ink: g('--ink-strong', '#1f2937'),
    muted: g('--ink-muted', '#64748b'),
    faint: g('--ink-faint', '#94a3b8'),
    grid: g('--divider', '#e5e7eb'),
    sunken: g('--bg-sunken', '#f6f7f9'),
    raised: g('--bg-raised', '#ffffff'),
    font: cs.fontFamily || 'system-ui, sans-serif',
  };
}

let plotlyPromise: Promise<any> | null = null;
const loadPlotly = () => (plotlyPromise ??= import('plotly.js-cartesian-dist-min').then((m) => m.default));

/** Start loading Plotly before the first chart needs it (called when the dashboard opens). */
export const preloadPlotly = () => { void loadPlotly(); };

interface Spec { data: any[]; layout: any }

/**
 * Plotly shows numeric dates in the browser's time zone, which would shift every
 * clock time. Wall-clock strings are drawn exactly as written, so all x values
 * go through this.
 */
const wall = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 23);

/**
 * The read-out follows the pointer through ordinary mouse events, not through
 * Plotly's hover system. Plotly throttles its hover events and recomputes hover
 * points on every move, which made the box trail behind the pointer. Here the
 * box and the cursor line are moved straight on the DOM node on every mouse
 * move; only the box's text goes through React, once per animation frame.
 *
 * `tip` gets the time under the pointer (ms on the wall-clock axis) and returns
 * the box content. `snapMs`, when given, snaps the cursor line to the nearest
 * of those x positions (the trend charts snap to a bucket).
 */
type TipFn = (cursorMs: number) => ReactNode;

function PlotlyChart({
  spec, height, filename, tip, tipTop = 8, snapMs,
}: {
  spec: (t: Theme) => Spec;
  height: number;
  filename: string;
  tip?: TipFn;
  tipTop?: number;
  snapMs?: number[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const [scheme, setScheme] = useState(0);
  const [tipNode, setTipNode] = useState<ReactNode>(null);
  const lastX = useRef<number | null>(null);
  const pendingNode = useRef<ReactNode>(null);
  const frame = useRef(0);
  const tipRef = useRef(tip);
  tipRef.current = tip;
  const snapRef = useRef(snapMs);
  snapRef.current = snapMs;

  // Re-theme when the operating-system colour scheme flips.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const bump = () => setScheme((n) => n + 1);
    mq.addEventListener('change', bump);
    return () => mq.removeEventListener('change', bump);
  }, []);

  // Draw when the data or settings change; Plotly.react diffs against what is on screen.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true;
    loadPlotly().then((Plotly) => {
      if (!live || !host.current) return;
      const t = readTheme(el);
      const { data, layout } = spec(t);
      const started = performance.now();
      Plotly.react(el, data, {
        autosize: true,
        height,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: t.font, size: 12, color: t.muted },
        hovermode: false,           // read-out and cursor are ours (see above)
        ...layout,
      }, {
        responsive: true,
        displaylogo: false,
        displayModeBar: 'hover',
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        toImageButtonOptions: { format: 'png', filename, scale: 2 },
      });
      console.debug(`[plot] ${filename} drawn in ${Math.round(performance.now() - started)} ms`);
    });
    return () => { live = false; };
    // spec is rebuilt only when the parent re-renders (new data or settings), never on hover
  }, [spec, height, filename, scheme]);

  // Panels start hidden (tabs / closed folds), so Plotly sizes itself when they appear.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && plotlyPromise) plotlyPromise.then((P) => P.Plots.resize(el));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      plotlyPromise?.then((P) => P.purge(el));
    };
  }, []);

  /** Put the box beside the pointer: right of it, flipping left past the middle. */
  const place = (el: HTMLDivElement, px: number) => {
    const flip = px > (host.current?.clientWidth ?? 600) / 2;
    el.style.left = `${flip ? px - 14 : px + 14}px`;
    el.style.transform = flip ? 'translateX(-100%)' : '';
  };

  const hide = () => {
    lastX.current = null;
    pendingNode.current = null;
    if (cursor.current) cursor.current.style.display = 'none';
    setTipNode(null);
  };

  const onMove = (e: React.MouseEvent) => {
    const gd = host.current as any;
    const fl = gd?._fullLayout;
    if (!fl?.xaxis || !fl._size || e.buttons) { if (e.buttons) hide(); return; }   // buttons = dragging a zoom box
    const rect = gd.getBoundingClientRect();
    const size = fl._size;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < size.l || mx > size.l + size.w || my < size.t || my > size.t + size.h) { hide(); return; }

    const xa = fl.xaxis;
    let ms = xa.p2l(mx - xa._offset);
    let px = mx;
    const snaps = snapRef.current;
    if (snaps?.length) {
      ms = snaps.reduce((best, v) => (Math.abs(v - ms) < Math.abs(best - ms) ? v : best), snaps[0]);
      px = xa._offset + xa.l2p(ms);
    }
    lastX.current = px;

    if (cursor.current) {
      const c = cursor.current.style;
      c.display = 'block';
      c.left = `${px}px`;
      c.top = `${size.t}px`;
      c.height = `${size.h}px`;
    }
    if (box.current) place(box.current, px);      // moves with the pointer, no React involved

    if (tipRef.current) {
      pendingNode.current = tipRef.current(ms);
      if (!frame.current) {
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          setTipNode(pendingNode.current);
        });
      }
    }
  };

  void scheme;
  return (
    <div style={{ position: 'relative', width: '100%' }} onMouseMove={onMove} onMouseLeave={hide}>
      <div ref={host} style={{ width: '100%', height }} />
      <div ref={cursor} className="chart-cursor-line" />
      {tipNode && (
        <div className="chart-tip" style={{ top: tipTop }}
          ref={(el) => { box.current = el; if (el && lastX.current !== null) place(el, lastX.current); }}>
          {tipNode}
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
   LineChart — the Trend fold. A true date axis, three lines, break at gaps,
   optional dashed limit line, hover read-out of all lines for a bucket.
   =========================================================================== */

export interface LineSeries {
  name: string;
  color: string;
  values: (number | null)[];
}

export function LineChart({
  title, unit, xs, series, limit, height = 280, tip,
}: {
  title: string;
  unit: string;
  /** x position of each bucket, epoch milliseconds (UTC midnight) */
  xs: number[];
  series: LineSeries[];
  limit: number | null;
  height?: number;
  /** lines of the hover read-out for the bucket at this index */
  tip?: (index: number) => string[];
}) {
  const spec = (t: Theme): Spec => {
    const xMin = xs[0] ?? 0;
    const xMax = xs[xs.length - 1] ?? 1;
    const spanDays = (xMax - xMin) / 86_400_000;
    const dense = xs.length > 120;

    const data: any[] = series.map((s) => ({
      type: 'scatter',
      mode: 'lines+markers',
      name: s.name,
      x: xs.map(wall),
      y: s.values,
      connectgaps: false,
      line: { color: s.color, width: 2, shape: 'linear' },
      marker: { color: s.color, size: dense ? 4 : 7 },
      hoverinfo: 'none',
    }));

    if (limit !== null) {
      data.push({
        type: 'scatter', mode: 'lines', name: 'Limit', x: [wall(xMin), wall(xMax)], y: [limit, limit],
        line: { color: COLORS.slate, width: 1.5, dash: 'dash' },
        hoverinfo: 'none',
      });
    }

    return {
      data,
      layout: {
        title: title ? { text: title, x: 0.01, font: { size: 14, color: t.ink } } : undefined,
        margin: { l: 58, r: 18, t: title ? 40 : 28, b: 44 },
        dragmode: 'zoom',
        showlegend: true,
        legend: { orientation: 'h', x: 0, y: 1.12, font: { color: t.ink } },
        xaxis: {
          type: 'date',
          tickformat: spanDays <= 90 ? '%d %b' : '%b %y',
          showgrid: false,
          linecolor: t.grid,
          tickfont: { color: t.muted, size: 11 },
        },
        yaxis: {
          title: { text: unit, font: { size: 11, color: t.faint } },
          rangemode: 'tozero',
          gridcolor: t.grid,
          zeroline: false,
          tickfont: { color: t.muted, size: 11 },
        },
      },
    };
  };
  return (
    <div className="dash-plot">
      <PlotlyChart spec={spec} height={height} filename={`trend-${unit}`} tipTop={40}
        snapMs={xs}
        tip={tip ? (ms) => {
          let best = 0;
          xs.forEach((x, i) => { if (Math.abs(x - ms) < Math.abs(xs[best] - ms)) best = i; });
          return tip(best).map((line, i) => <div key={i}>{line}</div>);
        } : undefined} />
    </div>
  );
}

/* ===========================================================================
   SignalStack — rows of signals on one shared clock-time axis.
   Used for the cycle panels (four 0/1 rows) and the landing roll (analog rows).
   One Plotly figure with a y-axis per row, so zoom/pan on time moves every
   row together and the hover read-out lists every signal at that instant.
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
  const gap = 8;
  const mt = 10;
  const mb = showAxis ? 38 : 10;
  const heights = rows.map((r) => r.height ?? (r.kind === 'binary' ? 46 : 96));
  const inner = heights.reduce((a, b) => a + b, 0) + gap * (rows.length - 1);
  const total = mt + mb + inner;

  const spec = (t: Theme): Spec => {
    const names = rows.map((_, i) => (i === 0 ? 'y' : `y${i + 1}`));
    const axisKeys = rows.map((_, i) => (i === 0 ? 'yaxis' : `yaxis${i + 1}`));
    const layout: any = {
      margin: { l: labelWidth + 8, r: 16, t: mt, b: mb },
      dragmode: 'zoom',
      showlegend: false,
      uirevision: `${xMin}-${xMax}`,
      shapes: [] as any[],
      annotations: [] as any[],
    };
    const data: any[] = [];
    let off = 0;

    rows.forEach((r, i) => {
      const step = r.kind === 'binary';
      const top = 1 - off / inner;
      const bottom = 1 - (off + heights[i]) / inner;
      off += heights[i] + gap;

      let range: [number, number];
      if (step) range = [-0.15, 1.15];
      else if (r.domain) range = r.domain;
      else {
        const vals = r.lines.flatMap((l) => l.points.map((p) => p[1])).filter((v): v is number => v !== null);
        const lo = vals.length ? Math.min(...vals) : 0;
        const hi = vals.length ? Math.max(...vals) : 1;
        const pad = (hi - lo || 1) * 0.08;
        range = [lo - pad, hi + pad];
      }

      layout[axisKeys[i]] = {
        domain: [bottom, top],
        range,
        fixedrange: true,                 // zoom and pan move time only
        anchor: 'x',
        zeroline: false,
        showline: false,
        showgrid: !step,
        gridcolor: t.grid,
        tickfont: { size: 10, color: t.faint },
        ...(step ? { tickvals: [0, 1] } : { nticks: 3 }),
      };
      // light band behind each row, as in the earlier design
      layout.shapes.push({
        type: 'rect', xref: 'paper', yref: 'paper', x0: 0, x1: 1, y0: bottom, y1: top,
        fillcolor: t.sunken, line: { color: t.grid, width: 1 }, layer: 'below',
      });
      layout.annotations.push({
        xref: 'paper', yref: 'paper', x: 0, y: (top + bottom) / 2, xanchor: 'right', yanchor: 'middle',
        xshift: -34, text: r.label, showarrow: false, font: { size: 12, color: t.ink }, align: 'right',
      });

      r.lines.forEach((l) => {
        data.push({
          type: 'scatter', mode: 'lines', name: l.name,
          x: l.points.map((p) => wall(p[0] * 1000)),
          y: l.points.map((p) => p[1]),
          xaxis: 'x', yaxis: names[i], connectgaps: false,
          line: { color: l.color, width: step ? 2 : 1.8, dash: l.dashed ? 'dash' : 'solid', shape: step ? 'hv' : 'linear' },
          hoverinfo: 'none',
        });
      });
    });

    layout.xaxis = {
      type: 'date',
      range: [wall(xMin * 1000), wall(xMax * 1000)],
      anchor: names[names.length - 1],
      showticklabels: showAxis,
      ticks: showAxis ? 'outside' : '',
      tickfont: { size: 11, color: t.muted },
      tickformatstops: [
        { dtickrange: [null, 1000], value: '%H:%M:%S.%L' },
        { dtickrange: [1000, null], value: '%H:%M:%S' },
      ],
      showgrid: true,
      gridcolor: t.grid,
      linecolor: t.grid,
    };

    // vertical event markers across every row, labels staggered so they never overlap
    markers.forEach((mk, mi) => {
      if (mk.t < xMin || mk.t > xMax) return;
      layout.shapes.push({
        type: 'line', xref: 'x', yref: 'paper', x0: wall(mk.t * 1000), x1: wall(mk.t * 1000), y0: 0, y1: 1,
        line: { color: mk.color, width: 1.2, dash: 'dot' },
      });
      layout.annotations.push({
        xref: 'x', yref: 'paper', x: wall(mk.t * 1000), y: 1, xanchor: 'left', yanchor: 'top',
        xshift: 4, yshift: -2 - mi * 13, text: mk.label, showarrow: false,
        font: { size: 10, color: mk.color },
      });
    });

    return { data, layout };
  };

  return (
    <div className="dash-stack">
      <PlotlyChart spec={spec} height={total} filename="flight-signals"
        tip={(cursorMs) => {
          const t = cursorMs / 1000;
          return (
            <>
              <div className="chart-tip-time">{fmtClock(t, 2)}</div>
              {rows.flatMap((r) => r.lines.map((l) => {
                const v = valueAt(l.points, t, r.kind === 'binary');
                return (
                  <div key={r.label + l.name}>
                    <span className="chart-swatch" style={{ background: l.color }} />
                    {l.name}: <b>{v === null ? '—' : r.kind === 'binary' ? v : fmtNum(v)}</b>
                  </div>
                );
              }))}
            </>
          );
        }} />
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

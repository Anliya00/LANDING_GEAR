import { useEffect, useRef, useState } from 'react';
import type { SignalPoint } from '@/api/flights';

let plotlyPromise: Promise<any> | null = null;
const loadPlotly = () => (plotlyPromise ??= import('plotly.js-cartesian-dist-min').then((m) => m.default));

interface Props {
  points: SignalPoint[];
  hasRealSignals: boolean;
}

export function FlightSignalsPlot({ points, hasRealSignals }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [showAirspeed, setShowAirspeed] = useState(true);
  const [showAltitude, setShowAltitude] = useState(true);
  const [showBrake, setShowBrake] = useState(true);
  const [showNoseGear, setShowNoseGear] = useState(true);
  const [showLhGear, setShowLhGear] = useState(true);
  const [showRhGear, setShowRhGear] = useState(true);

  useEffect(() => {
    const el = host.current;
    if (!el || points.length === 0) return;

    let live = true;
    loadPlotly().then((Plotly) => {
      if (!live || !host.current) return;

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const mutedColor = isDark ? '#b8c9d9' : '#52677d';
      const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

      const xClocks = points.map((p) => p.clock);

      const traces: any[] = [];

      // 1. Airspeed (Knots) - Y1 (Left)
      if (showAirspeed) {
        traces.push({
          x: xClocks,
          y: points.map((p) => p.airspeed),
          name: 'Airspeed (kt)',
          type: 'scatter',
          mode: 'lines',
          line: { color: '#1677ff', width: 2.2 },
          yaxis: 'y1',
          hovertemplate: '<b>Airspeed:</b> %{y:.1f} kt<extra></extra>',
        });
      }

      // 2. Altitude (ft) - Y2 (Right)
      if (showAltitude) {
        traces.push({
          x: xClocks,
          y: points.map((p) => p.altitude),
          name: 'Altitude (ft)',
          type: 'scatter',
          mode: 'lines',
          line: { color: '#a855f7', width: 2.2 },
          yaxis: 'y2',
          hovertemplate: '<b>Altitude:</b> %{y:.0f} ft<extra></extra>',
        });
      }

      // 3. Brake Pressure (psi) - Y3 (Left inner or scaled)
      if (showBrake) {
        traces.push({
          x: xClocks,
          y: points.map((p) => p.brake_pressure),
          name: 'Brake Pressure (psi)',
          type: 'scatter',
          mode: 'lines',
          line: { color: '#ef4444', width: 2.0 },
          yaxis: 'y3',
          hovertemplate: '<b>Brake Pressure:</b> %{y:.0f} psi<extra></extra>',
        });
      }

      // Discrete landing gear levels (distinct stepped channels so all are visible simultaneously)
      // 4. Nose Landing Gear (NG) - Emerald Green
      if (showNoseGear) {
        const ngStates = points.map((p) => (p.ng_position !== undefined ? p.ng_position : p.gear_position));
        traces.push({
          x: xClocks,
          y: ngStates.map((val) => (val === 1 ? 0.75 : 0)),
          customdata: ngStates.map((val) => (val === 1 ? 'Down (Locked)' : 'Up (Locked)')),
          name: 'Nose Gear (NG)',
          type: 'scatter',
          mode: 'lines',
          line: { color: '#10b981', width: 2.2, shape: 'hv' },
          yaxis: 'y4',
          hovertemplate: '<b>Nose Gear:</b> %{customdata}<extra></extra>',
        });
      }

      // 5. Left-Hand Main Landing Gear (LH MLG) - Cyan / Teal
      if (showLhGear) {
        const lhStates = points.map((p) => (p.lh_mlg_position !== undefined ? p.lh_mlg_position : p.gear_position));
        traces.push({
          x: xClocks,
          y: lhStates.map((val) => (val === 1 ? 1.05 : 0)),
          customdata: lhStates.map((val) => (val === 1 ? 'Down (Locked)' : 'Up (Locked)')),
          name: 'LH Main Gear (LH MLG)',
          type: 'scatter',
          mode: 'lines',
          line: { color: '#06b6d4', width: 2.0, shape: 'hv' },
          yaxis: 'y4',
          hovertemplate: '<b>LH Main Gear:</b> %{customdata}<extra></extra>',
        });
      }

      // 6. Right-Hand Main Landing Gear (RH MLG) - Amber / Orange
      if (showRhGear) {
        const rhStates = points.map((p) => (p.rh_mlg_position !== undefined ? p.rh_mlg_position : p.gear_position));
        traces.push({
          x: xClocks,
          y: rhStates.map((val) => (val === 1 ? 1.35 : 0)),
          customdata: rhStates.map((val) => (val === 1 ? 'Down (Locked)' : 'Up (Locked)')),
          name: 'RH Main Gear (RH MLG)',
          type: 'scatter',
          mode: 'lines',
          line: { color: '#f59e0b', width: 2.0, shape: 'hv' },
          yaxis: 'y4',
          hovertemplate: '<b>RH Main Gear:</b> %{customdata}<extra></extra>',
        });
      }

      // Annotations for flight phases
      const totalLen = xClocks.length;
      const tTakeoff = xClocks[Math.floor(totalLen * 0.20)] || xClocks[0];
      const tCruise = xClocks[Math.floor(totalLen * 0.45)] || xClocks[0];
      const tDescent = xClocks[Math.floor(totalLen * 0.75)] || xClocks[0];
      const tLanding = xClocks[Math.floor(totalLen * 0.90)] || xClocks[0];

      const annotations = [
        {
          x: tTakeoff,
          y: 1.05,
          yref: 'paper',
          text: 'Take-off',
          showarrow: false,
          font: { size: 11, color: '#3b82f6', weight: 'bold' },
          bgcolor: isDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.12)',
          bordercolor: '#3b82f6',
          borderwidth: 1,
          borderpad: 3,
        },
        {
          x: tCruise,
          y: 1.05,
          yref: 'paper',
          text: 'Normal Flight',
          showarrow: false,
          font: { size: 11, color: '#0284c7', weight: 'bold' },
          bgcolor: isDark ? 'rgba(2,132,199,0.18)' : 'rgba(2,132,199,0.12)',
          bordercolor: '#0284c7',
          borderwidth: 1,
          borderpad: 3,
        },
        {
          x: tDescent,
          y: 1.05,
          yref: 'paper',
          text: 'Touchdown',
          showarrow: false,
          font: { size: 11, color: '#6366f1', weight: 'bold' },
          bgcolor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)',
          bordercolor: '#6366f1',
          borderwidth: 1,
          borderpad: 3,
        },
        {
          x: tLanding,
          y: 1.05,
          yref: 'paper',
          text: 'Landing Roll',
          showarrow: false,
          font: { size: 11, color: '#ef4444', weight: 'bold' },
          bgcolor: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)',
          bordercolor: '#ef4444',
          borderwidth: 1,
          borderpad: 3,
        },
      ];

      const shapes = [
        // Takeoff vertical line
        {
          type: 'line',
          x0: tTakeoff,
          x1: tTakeoff,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: { color: 'rgba(59,130,246,0.5)', width: 1.5, dash: 'dash' },
        },
        // Touchdown vertical line
        {
          type: 'line',
          x0: tDescent,
          x1: tDescent,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: { color: 'rgba(99,102,241,0.5)', width: 1.5, dash: 'dash' },
        },
        // Landing vertical line
        {
          type: 'line',
          x0: tLanding,
          x1: tLanding,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: { color: 'rgba(239,68,68,0.6)', width: 1.5, dash: 'dash' },
        },
      ];

      const layout = {
        autosize: true,
        height: 380,
        margin: { l: 50, r: 60, t: 55, b: 40 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: 'inherit', size: 11, color: mutedColor },
        hovermode: 'x unified',
        showlegend: false,
        annotations,
        shapes,
        xaxis: {
          showgrid: true,
          gridcolor: gridColor,
          tickcolor: mutedColor,
          linecolor: gridColor,
          nticks: 10,
        },
        yaxis: {
          title: { text: 'Speed (kt) / Brake (psi)', font: { size: 11, color: '#1677ff' } },
          showgrid: true,
          gridcolor: gridColor,
          side: 'left',
          zeroline: false,
        },
        yaxis2: {
          title: { text: 'Altitude (ft)', font: { size: 11, color: '#a855f7' } },
          overlaying: 'y',
          side: 'right',
          showgrid: false,
          zeroline: false,
        },
        yaxis3: {
          overlaying: 'y',
          visible: false,
          range: [0, 3000],
        },
        yaxis4: {
          overlaying: 'y',
          visible: false,
          range: [-0.2, 5.2], // keep discrete gear lines cleanly visible near bottom
        },
      };

      Plotly.react(el, traces, layout, {
        responsive: true,
        displaylogo: false,
        displayModeBar: 'hover',
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      });
    });

    return () => {
      live = false;
    };
  }, [points, showAirspeed, showAltitude, showBrake, showNoseGear, showLhGear, showRhGear]);

  return (
    <div className="flight-signals-card">
      <div className="flight-signals-header">
        <div className="flight-signals-title">
          <h3>Key Signals (Full Flight)</h3>
          {!hasRealSignals && (
            <span className="flight-signals-badge">Profile Estimation</span>
          )}
        </div>
        <div className="signals-toggles">
          <label className="signal-checkbox">
            <input
              type="checkbox"
              checked={showAirspeed}
              onChange={(e) => setShowAirspeed(e.target.checked)}
            />
            <span className="dot dot-blue" />
            Airspeed
          </label>
          <label className="signal-checkbox">
            <input
              type="checkbox"
              checked={showAltitude}
              onChange={(e) => setShowAltitude(e.target.checked)}
            />
            <span className="dot dot-purple" />
            Altitude
          </label>
          <label className="signal-checkbox">
            <input
              type="checkbox"
              checked={showBrake}
              onChange={(e) => setShowBrake(e.target.checked)}
            />
            <span className="dot dot-red" />
            Brake Pressure
          </label>
          <label className="signal-checkbox" title="Nose Landing Gear Position">
            <input
              type="checkbox"
              checked={showNoseGear}
              onChange={(e) => setShowNoseGear(e.target.checked)}
            />
            <span className="dot dot-green" />
            Nose Gear
          </label>
          <label className="signal-checkbox" title="Left-Hand Main Landing Gear Position">
            <input
              type="checkbox"
              checked={showLhGear}
              onChange={(e) => setShowLhGear(e.target.checked)}
            />
            <span className="dot dot-cyan" />
            LH Main Gear
          </label>
          <label className="signal-checkbox" title="Right-Hand Main Landing Gear Position">
            <input
              type="checkbox"
              checked={showRhGear}
              onChange={(e) => setShowRhGear(e.target.checked)}
            />
            <span className="dot dot-amber" />
            RH Main Gear
          </label>
        </div>
      </div>

      <div className="flight-signals-chart-wrap" ref={host} />
    </div>
  );
}

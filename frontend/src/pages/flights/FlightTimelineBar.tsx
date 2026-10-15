import { useState, useMemo } from 'react';
import { Maximize2, Minimize2, Plus } from 'lucide-react';
import type { TimelinePhase } from '@/api/flights';

interface Props {
  totalDurationMin: number;
  phases: TimelinePhase[];
}

export function FlightTimelineBar({ totalDurationMin, phases }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activePhase, setActivePhase] = useState<TimelinePhase | null>(null);

  // 1. Calculate true total duration based on sum of phases
  const totalMin = useMemo(() => {
    const sum = phases.reduce((acc, p) => acc + (p.duration_min || 0), 0);
    return sum > 0 ? sum : Math.max(1, totalDurationMin);
  }, [phases, totalDurationMin]);

  // 2. Build boundary ticks that align 100% with the segment borders:
  // - Starts with phases[0].start_time at 0%
  // - Each subsequent boundary is placed at cumulative percentage of that phase
  const boundaryTicks = useMemo(() => {
    if (phases.length === 0) return [];
    const ticks: { time: string; pct: number }[] = [
      { time: phases[0].start_time || '00:00', pct: 0 }
    ];

    let cumMin = 0;
    phases.forEach((ph) => {
      cumMin += ph.duration_min || 0;
      ticks.push({
        time: ph.end_time || '',
        pct: Math.min(100, (cumMin / totalMin) * 100),
      });
    });
    return ticks;
  }, [phases, totalMin]);

  return (
    <div className="flight-timeline-card">
      <div className="flight-timeline-header">
        <div className="flight-timeline-title">
          <h3>Flight Timeline ({Math.round(totalMin)} minutes)</h3>
          {activePhase && (
            <span className="timeline-active-hint">
              Selected: <b>{activePhase.name}</b> ({activePhase.start_time} - {activePhase.end_time}, {activePhase.duration_min} min)
            </span>
          )}
        </div>
        <button
          type="button"
          className="timeline-expand-btn"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? 'Collapse phase list' : 'Expand phase list'}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className="flight-timeline-container">
        {/* Visual Segmented Bar */}
        <div className="timeline-bar">
          {phases.map((ph) => {
            const pct = (ph.duration_min / totalMin) * 100;
            const isSelected = activePhase?.id === ph.id;
            return (
              <div
                key={ph.id}
                className={`timeline-segment segment-${ph.id} ${isSelected ? 'is-selected' : ''}`}
                style={{ width: `${pct}%`, backgroundColor: ph.color }}
                onClick={() => setActivePhase(isSelected ? null : ph)}
                title={`${ph.name}: ${ph.start_time} - ${ph.end_time} (${ph.duration_min} min)`}
              >
                <span className="segment-plus"><Plus size={11} strokeWidth={2.5} /></span>
                <span className="segment-label">{ph.name}</span>
              </div>
            );
          })}
        </div>

        {/* Time Axis Ticks Exactly Aligned with Segment Borders */}
        <div className="timeline-ticks-container">
          {boundaryTicks.map((tick, i) => {
            const isFirst = i === 0;
            const isLast = i === boundaryTicks.length - 1;
            return (
              <div
                key={i}
                className="timeline-tick-item"
                style={{
                  left: `${tick.pct}%`,
                  transform: isFirst ? 'none' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                  alignItems: isFirst ? 'flex-start' : isLast ? 'flex-end' : 'center',
                }}
              >
                <div className="timeline-tick-notch" />
                <span className="timeline-tick-text">{tick.time}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded Table if user clicks expand */}
      {expanded && (
        <div className="timeline-expanded-details">
          <table className="timeline-phases-table">
            <thead>
              <tr>
                <th>Phase Name</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((p) => (
                <tr
                  key={p.id}
                  className={activePhase?.id === p.id ? 'is-active-row' : ''}
                  onClick={() => setActivePhase(activePhase?.id === p.id ? null : p)}
                >
                  <td>
                    <span className="phase-color-dot" style={{ backgroundColor: p.color }} />
                    <b>{p.name}</b>
                  </td>
                  <td>{p.start_time}</td>
                  <td>{p.end_time}</td>
                  <td>{p.duration_min} min</td>
                  <td>
                    <span className="tag tag-ok">Recorded</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

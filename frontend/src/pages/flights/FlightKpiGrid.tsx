import { CheckCircle2, AlertCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import type { KpiMetric } from '@/api/flights';

interface Props {
  kpis: KpiMetric[];
}

export function FlightKpiGrid({ kpis }: Props) {
  const renderLimitBadge = (status: KpiMetric['limit_status'], text: string) => {
    switch (status) {
      case 'within':
        return (
          <span className="limit-pill limit-within">
            <CheckCircle2 size={12} strokeWidth={2.5} />
            {text}
          </span>
        );
      case 'near':
        return (
          <span className="limit-pill limit-near">
            <AlertTriangle size={12} strokeWidth={2.5} />
            {text}
          </span>
        );
      case 'exceed':
        return (
          <span className="limit-pill limit-exceed">
            <AlertCircle size={12} strokeWidth={2.5} />
            {text}
          </span>
        );
      default:
        return (
          <span className="limit-pill limit-na">
            <HelpCircle size={12} strokeWidth={2.5} />
            {text}
          </span>
        );
    }
  };

  return (
    <div className="flight-kpi-grid">
      {kpis.map((kpi) => {
        const hasVal = kpi.value !== null && kpi.value !== undefined;
        let displayVal = hasVal ? String(kpi.value) : '—';
        if (hasVal && (kpi.key.includes('mass') || kpi.key.includes('distance') || kpi.key.includes('roll'))) {
          displayVal = Number(kpi.value).toLocaleString();
        }

        return (
          <div key={kpi.key} className="flight-kpi-card">
            <div className="flight-kpi-title">{kpi.title}</div>
            <div className="flight-kpi-main">
              <span className="flight-kpi-num">{displayVal}</span>
              {hasVal && <span className="flight-kpi-unit">{kpi.unit}</span>}
            </div>
            <div className="flight-kpi-badge-wrap">
              {renderLimitBadge(kpi.limit_status, kpi.limit_text)}
            </div>
            {kpi.benchmark && (
              <div className="flight-kpi-bench" title={`Benchmark limit: ${kpi.benchmark}`}>
                Limit: {kpi.benchmark}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

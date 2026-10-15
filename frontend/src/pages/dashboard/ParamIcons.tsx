import {
  ArrowDownCircle,
  ArrowUpCircle,
  Weight,
  Scale,
  TrendingDown,
  Zap,
  Waves,
  Ruler,
  Wind,
  Gauge,
  ArrowDownToDot,
  Activity,
} from 'lucide-react';

export function ParamIcon({ kind, size = 24 }: { kind: string; size?: number }) {
  switch (kind) {
    case 'extension':
      return <ArrowDownCircle size={size} strokeWidth={2} />;
    case 'retraction':
      return <ArrowUpCircle size={size} strokeWidth={2} />;
    case 'mass_up':
      return <Weight size={size} strokeWidth={2} />;
    case 'mass_down':
      return <Scale size={size} strokeWidth={2} />;
    case 'sink':
      return <TrendingDown size={size} strokeWidth={2.2} />;
    case 'nx_max':
      return <Zap size={size} strokeWidth={2} />;
    case 'nx_avg':
      return <Waves size={size} strokeWidth={2} />;
    case 'runway':
      return <Ruler size={size} strokeWidth={2} />;
    case 'chute':
      return <Wind size={size} strokeWidth={2} />;
    case 'nz_up':
      return <Gauge size={size} strokeWidth={2} />;
    case 'nz_down':
      return <ArrowDownToDot size={size} strokeWidth={2} />;
    default:
      return <Activity size={size} strokeWidth={2} />;
  }
}

export const PARAM_TONE: Record<string, 'blue' | 'orange'> = {
  extension: 'blue',
  retraction: 'blue',
  mass_up: 'blue',
  mass_down: 'blue',
  nx_avg: 'blue',
  runway: 'blue',
  sink: 'orange',
  nx_max: 'orange',
  chute: 'orange',
  nz_up: 'orange',
  nz_down: 'orange',
};

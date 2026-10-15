import React, { useEffect, useRef, useState } from 'react';
import type { LiveState, PipelineStats } from '../../hooks/useRecognition';
import { LiveBadge } from '../ui/Panel';

const HISTORY = 36;

/** A tiny line of recent values, scaled to its own range. */
const Spark: React.FC<{ values: number[]; color?: string }> = ({ values, color = '#ff9a3c' }) => {
  if (values.length < 2) return <svg className="h-7 w-full" />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / (HISTORY - 1)) * 100},${26 - ((v - min) / (max - min || 1)) * 22}`).join(' ');
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
};

const Cell: React.FC<{ kicker: string; children: React.ReactNode; className?: string }> = ({ kicker, children, className = '' }) => (
  <div className={`sk-plate rounded-[18px] p-4 ${className}`}>
    <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-white/40">{kicker}</p>
    {children}
  </div>
);

/** Live readout of the recognition pipeline, above the camera in Conversation mode. */
export const LiveStrip: React.FC<{ live: LiveState; stats: PipelineStats }> = ({ live, stats }) => {
  const [fpsHist, setFpsHist] = useState<number[]>([]);
  const [latHist, setLatHist] = useState<number[]>([]);
  const lastStats = useRef(stats);

  useEffect(() => {
    if (stats === lastStats.current) return;
    lastStats.current = stats;
    setFpsHist((h) => [...h, stats.fps].slice(-HISTORY));
    setLatHist((h) => [...h, stats.detectMs + stats.inferMs].slice(-HISTORY));
  }, [stats]);

  const p = live.prediction;
  const conf = p ? Math.round(p.confidence * 100) : 0;
  const holding = p && live.candidate === p.label;
  const R = 15;
  const C = 2 * Math.PI * R;
  const latency = stats.detectMs + stats.inferMs;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Live recognition readout">
      <Cell kicker="Reading" className="col-span-2 md:col-span-1">
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="truncate font-serif text-[32px] leading-none text-ink" aria-live="polite">
            {p ? p.label : <span className="text-white/30">—</span>}
          </p>
          <LiveBadge on={live.handsCount > 0} label={`${live.handsCount} hand${live.handsCount === 1 ? '' : 's'}`} />
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full ${conf >= 80 ? 'bg-saffron' : 'bg-white/40'}`} style={{ width: `${conf}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-white/45">
          {p ? `${conf}% ${p.source === 'mock' ? 'simulated confidence' : 'confidence'}` : 'Show your hand to the camera'}
        </p>
      </Cell>

      <Cell kicker="Hold">
        <div className="mt-2 flex items-center gap-3">
          <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90" aria-hidden="true">
            <circle cx="20" cy="20" r={R} fill="none" stroke="rgba(244,242,239,.1)" strokeWidth="3.5" />
            <circle
              cx="20"
              cy="20"
              r={R}
              fill="none"
              stroke={live.progress >= 1 ? '#34d399' : '#ff9a3c'}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - (holding ? live.progress : 0))}
            />
          </svg>
          <p className="text-sm leading-tight text-white/70">
            {holding && live.progress >= 1 ? 'Added. Lower your hand to repeat' : holding ? 'Keep holding…' : 'Hold a sign for 1 s'}
          </p>
        </div>
      </Cell>

      <Cell kicker="Frame rate">
        <p className="mt-2 font-mono text-2xl text-ink">
          {Math.round(stats.fps)}
          <span className="ml-1 text-xs text-white/40">fps</span>
        </p>
        <Spark values={fpsHist} />
      </Cell>

      <Cell kicker="Latency" className="hidden md:block">
        <p className="mt-2 font-mono text-2xl text-ink">
          {latency.toFixed(1)}
          <span className="ml-1 text-xs text-white/40">ms</span>
        </p>
        <p className="text-[11px] text-white/40">
          tracking {stats.detectMs.toFixed(1)} · model {stats.inferMs.toFixed(1)}
        </p>
        <Spark values={latHist} color="#b4c0ff" />
      </Cell>
    </div>
  );
};

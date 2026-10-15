import React from 'react';

/**
 * Sanket's card surface: a dark "measurement plate" with a dot grid and saffron corner
 * ticks, matching the sign cards on the landing page.
 */
export const Panel: React.FC<{
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'section';
}> = ({ children, className = '', as: Tag = 'div' }) => (
  <Tag className={`sk-plate overflow-hidden rounded-[22px] text-ink ${className}`}>{children}</Tag>
);

/** Card heading: uppercase kicker with a mono index, then a serif title. */
export const PanelHeader: React.FC<{
  index?: string;
  kicker: string;
  title?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ index, kicker, title, action }) => (
  <div className="flex items-start justify-between gap-4 px-6 pt-6">
    <div>
      <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-white/45">
        {index && <span className="font-mono tracking-normal text-saffron/80">{index}</span>}
        {kicker}
      </p>
      {title && <h3 className="mt-2 font-serif text-[26px] leading-[1.05] text-ink">{title}</h3>}
    </div>
    {action}
  </div>
);

/** "LIVE" marker with a pulsing saffron dot. */
export const LiveBadge: React.FC<{ on?: boolean; label?: string }> = ({ on = true, label = 'Live' }) => (
  <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.2em] text-white/55">
    <span className={`live-dot ${on ? 'on' : 'opacity-30 shadow-none'}`} />
    {label}
  </span>
);

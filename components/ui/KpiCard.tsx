import type { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  highlight?: boolean;
  accent?: string;
}

export default function KpiCard({ label, value, highlight = false, accent = 'var(--orange)' }: KpiCardProps) {
  return (
    <div
      className="kpi-card"
      style={{
        background: highlight ? '#050505' : 'var(--surface)',
        borderColor: highlight ? 'rgba(255,92,25,0.35)' : 'var(--line)',
      }}
    >
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: highlight ? '#fff' : 'var(--ink)' }}>{value}</div>
      <div className="kpi-bar">
        <div className="kpi-bar-fill" style={{ width: '100%', background: accent }} />
      </div>
    </div>
  );
}

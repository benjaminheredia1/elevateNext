interface StatusBadgeProps {
  status: 'abierto' | 'cerrado' | 'cuadra' | 'faltante' | 'sobrante' | string;
  label: string;
}

const COLORS: Record<string, { color: string; bg: string }> = {
  abierto: { color: 'var(--fresh)', bg: 'rgba(16,185,129,.15)' },
  cerrado: { color: 'var(--slate)', bg: 'rgba(255,255,255,.07)' },
  cuadra: { color: 'var(--fresh)', bg: 'rgba(16,185,129,.15)' },
  faltante: { color: 'var(--danger)', bg: 'rgba(239,68,68,.15)' },
  sobrante: { color: 'var(--amber)', bg: 'rgba(245,158,11,.15)' },
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const meta = COLORS[status] ?? COLORS.cerrado;
  return (
    <span style={{ color: meta.color, background: meta.bg, borderRadius: 8, padding: '4px 9px', fontSize: 12, fontWeight: 700 }}>
      {label}
    </span>
  );
}

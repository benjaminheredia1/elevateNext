type MetodoPago = 'EFECTIVO' | 'QR' | 'TARJETA' | 'MIXTO';

const METHOD_META: Record<MetodoPago, { label: string; color: string; bg: string }> = {
  EFECTIVO: { label: 'Efectivo', color: 'var(--fresh)', bg: 'rgba(16,185,129,.15)' },
  QR: { label: 'QR', color: 'var(--info)', bg: 'rgba(59,130,246,.15)' },
  TARJETA: { label: 'Tarjeta', color: 'var(--amber)', bg: 'rgba(245,158,11,.15)' },
  MIXTO: { label: 'QR + Efectivo', color: 'var(--violet, #8b5cf6)', bg: 'rgba(139,92,246,.15)' },
};

export default function MethodPill({ metodo }: { metodo: MetodoPago }) {
  const meta = METHOD_META[metodo] ?? METHOD_META.EFECTIVO;
  return (
    <span style={{ color: meta.color, background: meta.bg, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
      {meta.label}
    </span>
  );
}

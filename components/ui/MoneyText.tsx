interface MoneyTextProps {
  value: number | string;
  signed?: boolean;
}

export default function MoneyText({ value, signed = false }: MoneyTextProps) {
  const numeric = typeof value === 'string' ? Number(value) : value;
  const formatted = new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(numeric || 0));
  const sign = signed && numeric !== 0 ? (numeric > 0 ? '+' : '-') : '';
  const color = signed ? (numeric >= 0 ? 'var(--fresh)' : 'var(--danger)') : 'var(--ink)';

  return <span className="num" style={{ color, fontWeight: 700 }}>{sign}Bs {formatted}</span>;
}

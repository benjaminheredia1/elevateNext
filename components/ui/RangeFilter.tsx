'use client';

import type { RangoState, RangoKey } from '@/hooks/finanzas';

interface RangeFilterProps {
  value: RangoState;
  onChange: (value: RangoState) => void;
}

const OPTIONS: { key: RangoKey; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: '7d' },
  { key: 'mes', label: 'Mes' },
  { key: 'custom', label: 'Rango' },
];

export default function RangeFilter({ value, onChange }: RangeFilterProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div className="period-selector">
        {OPTIONS.map(option => (
          <button
            key={option.key}
            className={`period-btn ${value.rango === option.key ? 'active' : ''}`}
            type="button"
            onClick={() => onChange({ ...value, rango: option.key })}
          >
            {option.label}
          </button>
        ))}
      </div>
      {value.rango === 'custom' && (
        <>
          <input
            type="date"
            value={value.desde ?? ''}
            onChange={e => onChange({ ...value, desde: e.target.value })}
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: 8, padding: '8px 10px' }}
          />
          <input
            type="date"
            value={value.hasta ?? ''}
            onChange={e => onChange({ ...value, hasta: e.target.value })}
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: 8, padding: '8px 10px' }}
          />
        </>
      )}
    </div>
  );
}

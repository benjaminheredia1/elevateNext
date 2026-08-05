'use client';

import CustomDateRange, { hoyLocalISO } from '@/components/ui/CustomDateRange';
import SucursalSelector from '@/components/ui/SucursalSelector';
import type { RangoState, RangoKey } from '@/hooks/finanzas';

interface RangeFilterProps {
  value: RangoState;
  onChange: (value: RangoState) => void;
}

const OPTIONS: { key: RangoKey; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: '7d' },
  { key: 'mes', label: 'Mes' },
  { key: 'todo', label: 'Todo' },
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
            onClick={() => onChange(
              // Al entrar a "Rango" se parte de hoy–hoy para no consultar con fechas vacías.
              option.key === 'custom'
                ? { ...value, rango: option.key, desde: value.desde ?? hoyLocalISO(), hasta: value.hasta ?? hoyLocalISO() }
                : { ...value, rango: option.key },
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {value.rango === 'custom' && (
        <CustomDateRange
          desde={value.desde}
          hasta={value.hasta}
          onChange={({ desde, hasta }) => onChange({ ...value, desde, hasta })}
        />
      )}
      <SucursalSelector value={value.sucursal} onChange={sucursal => onChange({ ...value, sucursal })} />
    </div>
  );
}

'use client';

import CustomDateRange, { hoyLocalISO } from '@/components/ui/CustomDateRange';
import type { RangoKey } from '@/hooks/finanzas';

/**
 * Selector de período sin selector de sucursal.
 *
 * `RangeFilter` arrastra la sucursal porque es de admin; en caja el local sale
 * de la sesión y ofrecer el selector sería mentirle al cajero. Las opciones son
 * configurables para poder anteponer "Turno", que solo existe en la caja.
 */

/** `turno` es propio de la caja: lo que va del turno abierto, sin calendario. */
export type PeriodoKey = RangoKey | 'turno';

export interface PeriodoState {
  rango: PeriodoKey;
  desde?: string;
  hasta?: string;
}

export interface OpcionPeriodo { key: PeriodoKey; label: string }

export const OPCIONES_PERIODO: OpcionPeriodo[] = [
  { key: 'hoy', label: 'Día' },
  { key: '7d', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'custom', label: 'Rango' },
];

interface PeriodoFiltroProps {
  value: PeriodoState;
  onChange: (value: PeriodoState) => void;
  opciones?: OpcionPeriodo[];
}

export default function PeriodoFiltro({ value, onChange, opciones = OPCIONES_PERIODO }: PeriodoFiltroProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div className="period-selector">
        {opciones.map(opcion => (
          <button
            key={opcion.key}
            className={`period-btn ${value.rango === opcion.key ? 'active' : ''}`}
            type="button"
            onClick={() => onChange(
              // Al entrar a "Rango" se parte de hoy–hoy para no consultar con fechas vacías.
              opcion.key === 'custom'
                ? { ...value, rango: opcion.key, desde: value.desde ?? hoyLocalISO(), hasta: value.hasta ?? hoyLocalISO() }
                : { ...value, rango: opcion.key },
            )}
          >
            {opcion.label}
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
    </div>
  );
}

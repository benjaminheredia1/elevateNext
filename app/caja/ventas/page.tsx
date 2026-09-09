'use client';

import { useMemo, useState } from 'react';
import { useVentasCaja } from '@/hooks/caja';
import EmptyState from '@/components/ui/EmptyState';
import BotonRecibo from '@/components/ui/BotonRecibo';
import PeriodoFiltro, { type PeriodoState, type OpcionPeriodo } from '@/components/ui/PeriodoFiltro';
import TablaVentas, { ResumenVentas, FILTROS_FORMA, cumpleForma, type FiltroForma } from '@/components/ventas/TablaVentas';
import { useLocalesRecibo } from '@/hooks/recibo';
import { desdeVentaCaja } from '@/lib/recibo/adaptadores';

/**
 * Ventas de la caja.
 *
 * Complementa el libro de movimientos: ahí solo está la plata que entró o
 * salió, así que los fiados y las cortesías no aparecen nunca. Acá se ven
 * todas las ventas, cada una con cómo se cerró y qué se llevó.
 */

// "Turno" va primero porque es lo que el cajero mira todo el día; el resto son
// períodos de calendario para revisar lo de atrás sin salir de la caja.
const OPCIONES: OpcionPeriodo[] = [
  { key: 'turno', label: 'Turno' },
  { key: 'hoy', label: 'Día' },
  { key: '7d', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'custom', label: 'Rango' },
];

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });

function descripcion(ambito: string | undefined, desde: string | null, hasta: string | null) {
  if (ambito === 'TURNO') return 'Todas las ventas del turno activo, cobradas o no.';
  if (ambito === 'DIA') return 'Ventas de hoy en esta sucursal (no hay turno abierto).';
  if (desde && hasta) return `Ventas del ${fechaCorta(desde)} al ${fechaCorta(hasta)} en esta sucursal.`;
  return 'Ventas de esta sucursal.';
}

export default function VentasCajaPage() {
  const [periodo, setPeriodo] = useState<PeriodoState>({ rango: 'turno' });
  const { data, isLoading, isError } = useVentasCaja(periodo);
  const [filtro, setFiltro] = useState<FiltroForma>('TODAS');
  // Reimpresión: el papel se traba, se corta o el cliente lo pide después.
  const { localDe } = useLocalesRecibo();

  const ventas = useMemo(
    () => (data?.ventas ?? []).filter(v => cumpleForma(v, filtro)),
    [data, filtro],
  );

  const contar = (f: FiltroForma) => (data?.ventas ?? []).filter(v => cumpleForma(v, f)).length;

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1>Ventas</h1>
          <p>{descripcion(data?.ambito, data?.desde ?? null, data?.hasta ?? null)}</p>
        </div>
        <PeriodoFiltro value={periodo} onChange={setPeriodo} opciones={OPCIONES} />
      </div>

      <div className="admin-cat-filters" style={{ marginBottom: 18 }}>
        {FILTROS_FORMA.map(f => (
          <button
            key={f.id}
            className={`cat-filter-btn ${filtro === f.id ? 'active' : ''}`}
            onClick={() => setFiltro(f.id)}
            type="button"
          >
            {f.label} ({contar(f.id)})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="dash-card span-12" style={{ minHeight: 160 }} />
      ) : isError ? (
        <EmptyState title="No se pudieron cargar las ventas" />
      ) : ventas.length === 0 ? (
        <EmptyState
          title="Sin ventas"
          hint={filtro === 'TODAS' ? 'No se registraron ventas en el período elegido.' : 'Ninguna venta coincide con el filtro.'}
        />
      ) : (
        <>
          <ResumenVentas ventas={ventas} />
          <TablaVentas
            ventas={ventas}
            // Con más de un día a la vista la hora sola no ubica la venta.
            conFecha={periodo.rango !== 'turno' && periodo.rango !== 'hoy'}
            accionesDetalle={venta => (
              <BotonRecibo
                // El encabezado sale de la sucursal de la venta: mirando un mes
                // atrás ya no hay turno del que deducirla.
                datos={desdeVentaCaja(venta, localDe(venta.sucursal_id), { turnoId: data?.turno?.id ?? null })}
                etiqueta="Reimprimir recibo"
              />
            )}
          />
        </>
      )}
    </div>
  );
}

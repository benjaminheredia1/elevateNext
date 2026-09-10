'use client';

import { useMemo, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import RangeFilter from '@/components/ui/RangeFilter';
import BotonExportarExcel from '@/components/ui/BotonExportarExcel';
import EmptyState from '@/components/ui/EmptyState';
import TablaVentas, { ResumenVentas, FILTROS_FORMA, cumpleForma, type FiltroForma } from '@/components/ventas/TablaVentas';
import { useVentasAdmin, queryString, type RangoState } from '@/hooks/finanzas';

/**
 * Ventas del período.
 *
 * Es la pantalla de ventas de la caja mirada desde arriba: incluye los fiados y
 * las cortesías, que en el flujo de caja no aparecen porque no movieron plata,
 * y por eso las ventas del período nunca cuadran con lo cobrado.
 */
const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });

export default function VentasAdminPage() {
  const [rango, setRango] = useState<RangoState>({ rango: 'mes' });
  const [filtro, setFiltro] = useState<FiltroForma>('TODAS');
  const { data, isLoading, isError } = useVentasAdmin(rango);

  const ventas = useMemo(
    () => (data?.ventas ?? []).filter(v => cumpleForma(v, filtro)),
    [data, filtro],
  );

  const contar = (f: FiltroForma) => (data?.ventas ?? []).filter(v => cumpleForma(v, f)).length;
  // Sin sucursal elegida el dueño está viendo todos los locales juntos.
  const variasSucursales = !rango.sucursal;

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Ventas</h1>
          <p>
            {data
              ? `${data.total} venta(s) del ${fechaCorta(data.desde)} al ${fechaCorta(data.hasta)}, cobradas o no.`
              : 'Ventas del período, cobradas o no.'}
          </p>
        </div>
        <div className="admin-toolbar" style={{ marginBottom: 0 }}>
          <RangeFilter value={rango} onChange={setRango} />
          <BotonExportarExcel url={`/api/admin/ventas/export?${queryString(rango)}`} />
        </div>
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
          hint={filtro === 'TODAS' ? 'No hay ventas en el período elegido.' : 'Ninguna venta coincide con el filtro.'}
        />
      ) : (
        <>
          {/* Con el listado cortado los totales de arriba son parciales: hay que
              decirlo, o se leen como las ventas del período completo. */}
          {data?.truncado && (
            <div className="gate-warning" style={{ marginBottom: 14 }}>
              Se muestran las {data.ventas.length} ventas más recientes de {data.total}.
              Acotá el período o exportá a Excel para verlas todas.
            </div>
          )}
          <ResumenVentas ventas={ventas} />
          <TablaVentas ventas={ventas} mostrarSucursal={variasSucursales} conFecha />
        </>
      )}
    </AdminPanel>
  );
}

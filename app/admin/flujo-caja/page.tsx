'use client';

import { useMemo, useState } from 'react';
import BotonExportarExcel from '@/components/ui/BotonExportarExcel';
import AdminPanel from '@/components/admin/AdminPanel';
import VentaDetalleModal, { renderMetodo } from '@/components/admin/VentaDetalleModal';
import { useFlujoCaja, queryString, type RangoState } from '@/hooks/finanzas';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import RangeFilter from '@/components/ui/RangeFilter';
import DataTable from '@/components/ui/DataTable';
import ChartCard from '@/components/ui/ChartCard';
import EmptyState from '@/components/ui/EmptyState';

/** Movimiento tal como lo devuelve `/api/admin/flujo-caja`. */
interface MovimientoApi {
  id: number;
  created_at: string;
  tipo: string;
  metodo_pago: string | null;
  concepto: string | null;
  monto: number | string;
  transaccion_id: number | null;
  venta_cliente: string | null;
}

/** Fiado o cortesía del período: entregado, sin plata que haya tocado la caja. */
interface SinCobroApi {
  id: number;
  numero_sucursal: number | null;
  created_at: string;
  monto: number | string;
  es_cortesia: boolean;
  cliente: string | null;
}

/** Fila de la tabla: un movimiento real o un pedido sin cobro. */
interface FilaFlujo {
  key: string;
  created_at: string;
  tipo: string;
  metodo_pago: string | null;
  concepto: string;
  cliente: string | null;
  monto: number;
  /** Importe por cobrar o regalado. `null` en un movimiento real de caja. */
  pendiente: number | null;
  transaccion_id: number | null;
}

export default function AdminFlujoCajaPage() {
  const [rango, setRango] = useState<RangoState>({ rango: 'mes' });
  const [ventaAbierta, setVentaAbierta] = useState<number | null>(null);
  const flujo = useFlujoCaja(rango);
  const data = flujo.data;

  const metodos = useMemo(
    () => (data?.por_metodo ?? []).map((item: any) => ({ name: item.metodo ?? 'Sin metodo', value: Number(item.monto ?? 0) })),
    [data],
  );
  const entradasCategoria = useMemo(
    () => (data?.entradas_por_categoria ?? []).map((item: any) => ({ name: item.categoria ?? 'Sin categoria', value: Number(item.monto ?? 0) })),
    [data],
  );
  const salidasCategoria = useMemo(
    () => (data?.salidas_por_categoria ?? []).map((item: any) => ({ name: item.categoria ?? 'Sin categoria', value: Number(item.monto ?? 0) })),
    [data],
  );

  /**
   * Movimientos reales + fiados y cortesías del período, ordenados por hora.
   *
   * Fiados y cortesías no movieron plata, así que van en Bs 0 con su importe en
   * la columna "Sin cobrar". Sin ellos el detalle del día no explica por qué las
   * ventas no coinciden con la caja, que es justo lo que pedía contabilidad.
   * Es el mismo criterio del libro del cajero (`lib/shared/libro-caja.ts`).
   */
  const filas = useMemo<FilaFlujo[]>(() => {
    const movimientos = (data?.movimientos ?? []).map((m: MovimientoApi): FilaFlujo => ({
      key: `mov-${m.id}`,
      created_at: m.created_at,
      tipo: m.tipo,
      metodo_pago: m.metodo_pago,
      concepto: m.concepto ?? '-',
      cliente: m.venta_cliente ?? null,
      monto: Number(m.monto ?? 0),
      pendiente: null,
      transaccion_id: m.transaccion_id,
    }));
    const sinCobro = (data?.pedidos_sin_cobro ?? []).map((p: SinCobroApi): FilaFlujo => ({
      key: `ped-${p.id}`,
      created_at: p.created_at,
      tipo: p.es_cortesia ? 'CORTESIA' : 'FIADO',
      metodo_pago: null,
      concepto: `${p.es_cortesia ? 'Cortesía' : 'Fiado'} #${p.numero_sucursal ?? p.id}`,
      cliente: p.cliente ?? null,
      monto: 0,
      pendiente: Number(p.monto ?? 0),
      transaccion_id: p.id,
    }));
    return [...movimientos, ...sinCobro].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [data]);

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Flujo de Caja</h1>
          <p>Entradas, salidas y neto por metodo y categoria.</p>
        </div>
        <div className="admin-toolbar" style={{ marginBottom: 0 }}>
          <RangeFilter value={rango} onChange={setRango} />
          <BotonExportarExcel url={`/api/admin/flujo-caja/export?${queryString(rango)}`} />
          {/* El informe que usa contabilidad: ventas por producto, ingresos por
              turno y la conciliación que explica por qué esos dos no coinciden. */}
          <BotonExportarExcel
            url={`/api/admin/flujo-caja/informe-contable/export?${queryString(rango)}`}
            etiqueta="Informe contable"
            className="admin-btn"
          />
        </div>
      </div>

      {ventaAbierta !== null && (
        <VentaDetalleModal transaccionId={ventaAbierta} onClose={() => setVentaAbierta(null)} />
      )}

      {flujo.isLoading ? <EmptyState title="Cargando flujo de caja..." /> : flujo.isError ? <EmptyState title="No se pudo cargar flujo de caja" /> : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Entradas" value={<MoneyText value={data?.entradas ?? 0} />} highlight accent="var(--fresh)" />
            <KpiCard label="Salidas" value={<MoneyText value={data?.salidas ?? 0} />} accent="var(--danger)" />
            <KpiCard label="Neto" value={<MoneyText value={data?.flujo_neto ?? 0} signed />} accent="var(--orange)" />
            {/* No suman al flujo: no entró ni salió plata. Están acá porque son
                la explicación de por qué las ventas del período no coinciden
                con la caja. */}
            <KpiCard label="Fiado otorgado" value={<MoneyText value={data?.fiados_otorgados ?? 0} />} accent="var(--amber)" />
            <KpiCard label="Cortesías" value={<MoneyText value={data?.cortesias ?? 0} />} accent="var(--info)" />
          </div>

          <div className="finance-grid">
            <ChartCard title="Por metodo (neto)" data={metodos} color="#3b82f6" />
            <ChartCard title="Entradas por categoria" data={entradasCategoria} color="#10b981" />
            <ChartCard title="Salidas por categoria" data={salidasCategoria} color="#e5484d" />
          </div>

          <div className="finance-panel span-12">
            <DataTable
              data={filas}
              emptyTitle="Sin movimientos en el periodo"
              rowKey={(row: FilaFlujo) => row.key}
              onRowClick={(row: FilaFlujo) => setVentaAbierta(row.transaccion_id)}
              isRowClickable={(row: FilaFlujo) => !!row.transaccion_id}
              columns={[
                { key: 'fecha', header: 'Fecha', render: (row: FilaFlujo) => new Date(row.created_at).toLocaleString('es-BO') },
                { key: 'tipo', header: 'Tipo', render: (row: FilaFlujo) => row.tipo },
                { key: 'metodo', header: 'Metodo', render: (row: FilaFlujo) => renderMetodo(row.metodo_pago ?? '-') },
                { key: 'concepto', header: 'Concepto', render: (row: FilaFlujo) => (
                  <div>
                    <div>{row.concepto ?? '-'}</div>
                    {row.cliente && <div className="admin-cell-sub">{row.cliente}</div>}
                  </div>
                )},
                { key: 'monto', header: 'Monto', className: 'num', render: (row: FilaFlujo) => <MoneyText value={row.monto ?? 0} /> },
                // Fiado por cobrar o cortesía entregada: no movió caja, por eso
                // va aparte del monto y no suma al neto.
                { key: 'pendiente', header: 'Sin cobrar', className: 'num', render: (row: FilaFlujo) => (
                  row.pendiente == null
                    ? <span className="admin-cell-muted">—</span>
                    : <MoneyText value={row.pendiente} />
                )},
                { key: 'detalle', header: '', className: 'num', render: (row: FilaFlujo) => (
                  row.transaccion_id
                    ? <span className="venta-detalle-link">Ver detalle ›</span>
                    : <span className="admin-cell-muted">—</span>
                )},
              ]}
            />
          </div>
        </>
      )}
    </AdminPanel>
  );
}

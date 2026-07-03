'use client';

import { useMemo, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import { useTurnos, useTurnoDetalleAdmin, type RangoState } from '@/hooks/finanzas';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import RangeFilter from '@/components/ui/RangeFilter';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { estadoDiferencia } from '@/lib/shared/caja-calc';
import '@/app/caja/caja.css';

function fmtDate(value: string) {
  return new Date(value).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtRange(start: string, end?: string | null) {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
  const startStr = new Date(start).toLocaleString('es-BO', opts);
  const endStr = end ? new Date(end).toLocaleString('es-BO', opts) : '—';
  return `${startStr} → ${endStr}`;
}

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function nombreCajero(cajero?: { nombre: string; apellido_paterno?: string } | null) {
  if (!cajero) return '—';
  return cajero.nombre;
}

interface Detalle {
  cantidad: number;
  producto: { nombre: string };
}

interface Pedido {
  id: number;
  created_at: string;
  total: number;
  metodo_pago?: string | null;
  tipo_entrega?: string | null;
  es_cortesia: boolean;
  cajero?: { nombre: string; apellido_paterno?: string } | null;
  transaccionesDetalles_id: Detalle[];
  cuenta_corriente?: { id: number; estado: string } | null;
}

function pedidoResumen(pedido: Pedido) {
  const items = pedido.transaccionesDetalles_id.map(d => `${d.cantidad}× ${d.producto.nombre}`).join(', ');
  const entrega = pedido.tipo_entrega === 'RECOJO' ? ' Llevar' : pedido.tipo_entrega === 'DELIVERY' ? ' Delivery' : '';
  const metodo = pedido.metodo_pago ?? '';
  return `${items}${entrega}${metodo ? ` · ${metodo}` : ''}`;
}

function TurnoDetalleModal({ turnoId, onClose }: { turnoId: number; onClose: () => void }) {
  const { data, isLoading } = useTurnoDetalleAdmin(turnoId);
  const [verPedidos, setVerPedidos] = useState(false);
  const turno = data?.turno;
  const pedidos = useMemo(() => (data?.pedidos ?? []) as Pedido[], [data]);
  const totalVentas = useMemo(() => pedidos.reduce((sum, p) => sum + asNumber(p.total), 0), [pedidos]);

  const difEfectivo = asNumber(turno?.diferencia_efectivo);
  const difQr = asNumber(turno?.diferencia_qr);

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2>Detalle de turno</h2>
            {turno && <p className="historial-modal-range">{fmtRange(turno.fecha_apertura, turno.fecha_cierre)}</p>}
          </div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Cerrar">&times;</button>
        </div>
        <div className="admin-modal-body">
          {isLoading || !turno ? (
            <div className="caja-skeleton" style={{ minHeight: 220 }} />
          ) : (
            <>
              {turno.sucursal && <span className="historial-pill">{turno.sucursal.nombre}</span>}

              <div className="historial-detail-rows">
                <div><span>Cajero</span><strong>{nombreCajero(turno.cajero)}</strong></div>
                <div><span>Apertura efectivo</span><strong><MoneyText value={asNumber(turno.apertura_efectivo)} /></strong></div>
                <div><span>Apertura QR</span><strong><MoneyText value={asNumber(turno.apertura_qr)} /></strong></div>
                <div className="historial-detail-divider" />
                <div><span>Esperado efectivo</span><strong><MoneyText value={asNumber(turno.esperado_efectivo)} /></strong></div>
                <div><span>Esperado QR</span><strong><MoneyText value={asNumber(turno.esperado_qr)} /></strong></div>
                <div><span>Contado efectivo</span><strong><MoneyText value={asNumber(turno.real_efectivo)} /></strong></div>
                <div><span>Contado QR</span><strong><MoneyText value={asNumber(turno.real_qr)} /></strong></div>
                <div className="historial-detail-divider" />
                <div className="strong-row"><span>Diferencia efectivo</span><strong><MoneyText value={difEfectivo} signed /></strong></div>
                <div className="strong-row"><span>Diferencia QR</span><strong><MoneyText value={difQr} signed /></strong></div>
              </div>

              {turno.observaciones && <p className="historial-obs">{turno.observaciones}</p>}

              <button type="button" className="historial-toggle" onClick={() => setVerPedidos(v => !v)}>
                {verPedidos ? '▲ Ocultar pedidos' : `▼ Ver pedidos (${turno.pedidos_count ?? pedidos.length})`}
              </button>

              {verPedidos && (
                <div className="historial-pedidos">
                  <div className="historial-pedidos-head">
                    <span>{pedidos.length} pedidos</span>
                    <span>Ventas: <MoneyText value={totalVentas} /></span>
                  </div>
                  <div className="historial-pedidos-list">
                    {pedidos.length === 0 ? (
                      <EmptyState title="Sin pedidos" hint="Este turno no registró pedidos." />
                    ) : pedidos.map(pedido => (
                      <div className="historial-pedido-row" key={pedido.id}>
                        <div className="historial-pedido-main">
                          <span>#{pedido.id} · {fmtTime(pedido.created_at)} · {nombreCajero(pedido.cajero)}</span>
                          {pedido.es_cortesia ? (
                            <span className="historial-pill cortesia">Cortesía</span>
                          ) : pedido.cuenta_corriente ? (
                            <span className="historial-pill fiado">
                              Fiado{pedido.cuenta_corriente.estado === 'PAGADA' ? ' · pagado' : ''} · <MoneyText value={asNumber(pedido.total)} />
                            </span>
                          ) : (
                            <MoneyText value={asNumber(pedido.total)} />
                          )}
                        </div>
                        <span className="historial-pedido-sub">{pedidoResumen(pedido)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminCajaPage() {
  const [rango, setRango] = useState<RangoState>({ rango: 'mes' });
  const turnos = useTurnos(rango);
  const rows = turnos.data?.turnos ?? [];
  const [selected, setSelected] = useState<number | null>(null);

  const resumen = useMemo(() => rows.reduce((acc: any, row: any) => {
    const ventas = Number(row.ventas_efectivo ?? 0) + Number(row.ventas_qr ?? 0);
    const esperado = Number(row.esperado_efectivo ?? 0) + Number(row.esperado_qr ?? 0);
    const real = Number(row.real_efectivo ?? 0) + Number(row.real_qr ?? 0);
    acc.turnos += 1;
    acc.abiertos += row.estado === 'ABIERTO' ? 1 : 0;
    acc.ventas += ventas;
    acc.esperado += esperado;
    acc.real += real;
    acc.diferencia += Number(row.diferencia_total ?? 0);
    return acc;
  }, { turnos: 0, abiertos: 0, ventas: 0, esperado: 0, real: 0, diferencia: 0 }), [rows]);

  const latest = rows.slice(0, 5);

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <span className="admin-badge">Finanzas</span>
          <h1>Caja</h1>
          <p>Supervisión de turnos, ventas registradas y diferencias de cierre.</p>
        </div>
        <RangeFilter value={rango} onChange={setRango} />
      </div>

      {turnos.isLoading ? <EmptyState title="Cargando turnos..." /> : turnos.isError ? <EmptyState title="No se pudo cargar turnos" /> : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Turnos" value={resumen.turnos} highlight />
            <KpiCard label="Abiertos" value={resumen.abiertos} accent="var(--fresh)" />
            <KpiCard label="Ventas" value={<MoneyText value={resumen.ventas} />} accent="var(--info)" />
            <KpiCard label="Diferencia" value={<MoneyText value={resumen.diferencia} signed />} accent={Math.abs(resumen.diferencia) < 0.01 ? 'var(--fresh)' : 'var(--amber)'} />
          </div>

          <div className="finance-split">
            <div>
              <DataTable
                data={rows}
                emptyTitle="Sin turnos en el periodo"
                rowKey={(row: any) => row.id}
                onRowClick={(row: any) => setSelected(row.id)}
                columns={[
                  { key: 'id', header: 'Turno', render: (row: any) => <strong>#{row.id}</strong> },
                  { key: 'estado', header: 'Estado', render: (row: any) => <StatusBadge status={String(row.estado).toLowerCase()} label={row.estado} /> },
                  { key: 'cajero', header: 'Cajero', render: (row: any) => row.cajero?.nombre ?? row.cajero?.email ?? '-' },
                  { key: 'apertura', header: 'Apertura', render: (row: any) => fmtDate(row.fecha_apertura) },
                  { key: 'ventas', header: 'Ventas', className: 'num', render: (row: any) => <MoneyText value={Number(row.ventas_efectivo ?? 0) + Number(row.ventas_qr ?? 0)} /> },
                  { key: 'esperado', header: 'Esperado', className: 'num', render: (row: any) => <MoneyText value={Number(row.esperado_efectivo ?? 0) + Number(row.esperado_qr ?? 0)} /> },
                  { key: 'real', header: 'Real', className: 'num', render: (row: any) => <MoneyText value={Number(row.real_efectivo ?? 0) + Number(row.real_qr ?? 0)} /> },
                  {
                    key: 'diferencia',
                    header: 'Diferencia',
                    className: 'num',
                    render: (row: any) => {
                      const diff = Number(row.diferencia_total ?? 0);
                      const meta = estadoDiferencia(diff);
                      return <StatusBadge status={meta.status} label={`${meta.label} Bs ${Math.abs(diff).toFixed(2)}`} />;
                    },
                  },
                ]}
              />
            </div>

            <aside className="finance-panel span-12">
              <div className="finance-panel-header">
                <div>
                  <h3>Resumen de control</h3>
                  <p>Comparación del efectivo/QR esperado contra lo declarado.</p>
                </div>
              </div>
              <div className="finance-list">
                <div className="finance-row"><span>Esperado</span><strong><MoneyText value={resumen.esperado} /></strong></div>
                <div className="finance-row"><span>Declarado</span><strong><MoneyText value={resumen.real} /></strong></div>
                <div className="finance-row"><span>Diferencia total</span><strong><MoneyText value={resumen.diferencia} signed /></strong></div>
              </div>

              <div className="finance-panel-header" style={{ marginTop: 22 }}>
                <div>
                  <h3>Últimos turnos</h3>
                  <p>Actividad reciente del periodo seleccionado.</p>
                </div>
              </div>
              <div className="finance-timeline">
                {latest.length === 0 ? (
                  <EmptyState title="Sin actividad" hint="No hay turnos para mostrar." />
                ) : latest.map((turno: any) => {
                  const diff = Number(turno.diferencia_total ?? 0);
                  const ventas = Number(turno.ventas_efectivo ?? 0) + Number(turno.ventas_qr ?? 0);
                  return (
                    <div className="finance-timeline-item" key={turno.id} onClick={() => setSelected(turno.id)} style={{ cursor: 'pointer' }}>
                      <span className={`finance-dot ${Math.abs(diff) < 0.01 ? 'in' : 'out'}`} />
                      <div>
                        <div className="finance-timeline-title">Turno #{turno.id}</div>
                        <div className="finance-timeline-sub">{turno.cajero?.nombre ?? turno.cajero?.email ?? 'Sin cajero'} · {fmtDate(turno.fecha_apertura)}</div>
                      </div>
                      <span className="finance-amount"><MoneyText value={ventas} /></span>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        </>
      )}

      {selected != null && <TurnoDetalleModal turnoId={selected} onClose={() => setSelected(null)} />}
    </AdminPanel>
  );
}

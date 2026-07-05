'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import EmptyState from '@/components/ui/EmptyState';
import MoneyText from '@/components/ui/MoneyText';
import { useHistorial, useTurnoActivo, useTurnoDetalle } from '@/hooks/caja';
import { estadoDiferencia } from '@/lib/shared/caja-calc';

interface TurnoResumen {
  id: number;
  fecha_apertura: string;
  fecha_cierre?: string | null;
  ventas_efectivo: string | number;
  ventas_qr: string | number;
  diferencia_efectivo?: string | number | null;
  diferencia_qr?: string | number | null;
  observaciones?: string | null;
  pedidos_count: number;
  sucursal?: { nombre: string } | null;
  cajero?: { nombre: string; apellido_paterno: string } | null;
}

interface Detalle {
  cantidad: number;
  precio_unitario: number;
  producto: { nombre: string };
}

interface Pedido {
  id: number;
  created_at: string;
  total: number;
  metodo_pago?: string | null;
  tipo_entrega?: string | null;
  es_cortesia?: boolean;
  cajero?: { nombre: string; apellido_paterno: string } | null;
  transaccionesDetalles_id: Detalle[];
  cuenta_corriente?: { id: number; estado: string } | null;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function duration(start: string, end?: string | null) {
  if (!end) return '—';
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}min` : `${m}min`;
}

function fmtRange(start: string, end?: string | null) {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
  const startStr = new Date(start).toLocaleString('es-BO', opts);
  const endStr = end ? new Date(end).toLocaleString('es-BO', opts) : '—';
  return `${startStr} → ${endStr}`;
}

function fmtDay(value: string) {
  return new Date(value).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });
}

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

function EstadoTexto({ diff }: { diff: number }) {
  const meta = estadoDiferencia(diff);
  if (meta.status === 'cuadra') return <span className="historial-estado" style={{ color: 'var(--slate)' }}>Cuadra exacto</span>;
  const color = meta.status === 'faltante' ? 'var(--danger)' : 'var(--fresh)';
  const sign = diff > 0 ? '+' : '';
  return <span className="historial-estado" style={{ color }}>Bs {sign}{diff.toFixed(0)} {meta.status}</span>;
}

function nombreCajero(cajero?: { nombre: string; apellido_paterno: string } | null) {
  if (!cajero) return '—';
  return cajero.nombre;
}

function pedidoResumen(pedido: Pedido) {
  const items = pedido.transaccionesDetalles_id
    .map(d => `${d.cantidad}× ${d.producto.nombre}`)
    .join(', ');
  const entrega = pedido.tipo_entrega === 'RECOJO' ? ' Llevar' : pedido.tipo_entrega === 'DELIVERY' ? ' Delivery' : '';
  const metodo = pedido.metodo_pago ?? '';
  return `${items}${entrega}${metodo ? ` · ${metodo}` : ''}`;
}

function DetalleTurno({ turnoId, onClose }: { turnoId: number; onClose: () => void }) {
  const { data, isLoading } = useTurnoDetalle(turnoId);
  const [verPedidos, setVerPedidos] = useState(false);
  const turno = data?.turno as (TurnoResumen & {
    apertura_efectivo: string | number;
    apertura_qr: string | number;
    esperado_efectivo?: string | number | null;
    esperado_qr?: string | number | null;
    real_efectivo?: string | number | null;
    real_qr?: string | number | null;
  }) | undefined;
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

              <button
                type="button"
                className="historial-toggle"
                onClick={() => setVerPedidos(v => !v)}
              >
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

export default function HistorialCajaPage() {
  const { data, isLoading, isError } = useHistorial();
  const turnoActivo = useTurnoActivo();
  const turnos = (data ?? []) as TurnoResumen[];
  const [selected, setSelected] = useState<number | null>(null);

  const ultimoCierre = turnos[0]?.fecha_cierre;
  const sucursalNombre = turnoActivo.data?.sucursal?.nombre ?? turnos[0]?.sucursal?.nombre;
  const cajaAbierta = Boolean(turnoActivo.data?.id);

  return (
    <div>
      <div className={`historial-status-card ${cajaAbierta ? 'abierta' : 'cerrada'}`}>
        <div className="historial-status-left">
          <span className={`historial-status-dot ${cajaAbierta ? 'abierta' : 'cerrada'}`} />
          <div>
            <h2>{cajaAbierta ? 'CAJA ABIERTA' : 'CAJA CERRADA'}{sucursalNombre ? ` · ${sucursalNombre.toUpperCase()}` : ''}</h2>
            {!cajaAbierta && ultimoCierre && (
              <p>Último cierre: {new Date(ultimoCierre).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            )}
          </div>
        </div>
        <Link className="admin-btn primary" href="/caja">{cajaAbierta ? 'Ir a caja' : 'Abrir caja'}</Link>
      </div>

      <div className="historial-section">
        <h3>Historial de turnos</h3>

        {isLoading ? (
          <div className="caja-skeleton" style={{ minHeight: 200 }} />
        ) : isError ? (
          <EmptyState title="No se pudo cargar historial" />
        ) : turnos.length === 0 ? (
          <EmptyState title="Sin cierres" hint="Los turnos cerrados aparecerán aquí." />
        ) : (
          <div className="historial-list">
            {turnos.map(turno => {
              const diff = asNumber(turno.diferencia_efectivo) + asNumber(turno.diferencia_qr);
              return (
                <button
                  type="button"
                  key={turno.id}
                  className="historial-row"
                  onClick={() => setSelected(turno.id)}
                >
                  <span className="historial-row-day">{fmtDay(turno.fecha_apertura)}</span>
                  <div className="historial-row-main">
                    <strong>{fmtRange(turno.fecha_apertura, turno.fecha_cierre)}</strong>
                    <div className="historial-row-meta">
                      {turno.sucursal && <span className="historial-pill">{turno.sucursal.nombre}</span>}
                      <span>· {nombreCajero(turno.cajero)}</span>
                      <span>· Duración {duration(turno.fecha_apertura, turno.fecha_cierre)}</span>
                      {turno.observaciones && <span className="historial-row-obs">{turno.observaciones}</span>}
                    </div>
                  </div>
                  <EstadoTexto diff={diff} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected != null && <DetalleTurno turnoId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

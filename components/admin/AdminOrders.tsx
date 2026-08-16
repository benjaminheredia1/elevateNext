'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import apiClient from '@/hooks/api';
import { useCrearFiado } from '@/hooks/cuentas-corrientes';
import { useSucursalAdmin } from '@/hooks/sucursal-admin';
import BotonExportarExcel from '@/components/ui/BotonExportarExcel';
import BotonRecibo from '@/components/ui/BotonRecibo';
import { useLocalesRecibo } from '@/hooks/recibo';
import { desdeTransaccion, type TransaccionRecibo } from '@/lib/recibo/adaptadores';
import type { LocalRecibo } from '@/lib/recibo/tipos';

type EstadoPedido = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO' | 'EN_LOCAL' | 'EN_CAMINO' | 'LLEGO' | 'ENTREGADO' | 'CANCELADO' | 'PAGADO';
type FiltroEstado = 'Todos' | EstadoPedido;

interface DetalleItem {
  id: number;
  cantidad: number;
  precio_unitario: number;
  descuentoAplicado: number;
  producto: { nombre: string };
  /** Las líneas de un combo lo comparten: el recibo las agrupa en una. */
  combo?: { id: number; nombre: string } | null;
}

interface Pedido {
  id: number;
  /** Correlativo propio de la sucursal: es el número que ve el cliente. */
  numero_sucursal?: number | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cliente_direccion: string | null;
  /** Nota que dejó el cliente al pedir: "sin picante", "tocar timbre". */
  notas?: string | null;
  tipo_entrega?: 'RECOJO' | 'DELIVERY' | null;
  metodo_pago: string | null;
  payment_status?: string | null;
  total: number;
  estado: EstadoPedido | string;
  created_at: string;
  driver_nombre?: string | null;
  driver_link_id?: string | null;
  transaccionesDetalles_id: DetalleItem[];
  // Datos que solo consume el recibo impreso.
  sucursal_id?: number;
  numero_turno?: number | null;
  turno_id?: number | null;
  codigo_descuento?: string | null;
  es_cortesia?: boolean;
  costo_envio?: number | string | null;
  cajero?: { nombre: string } | null;
  cuenta_corriente?: { monto: number | string; monto_pagado?: number | string; vencimiento?: string | null } | null;
}

const PAYMENT_META: Record<string, { label: string; color: string; bg: string }> = {
  PENDIENTE: { label: 'Pago pendiente', color: 'var(--amber)', bg: 'rgba(232,163,23,.14)' },
  PAGADO: { label: 'Pagado', color: 'var(--fresh)', bg: 'rgba(31,169,113,.14)' },
  REEMBOLSADO: { label: 'Reembolsado', color: 'var(--slate)', bg: 'var(--canvas)' },
  COD_PENDIENTE: { label: 'Cobro contra entrega', color: 'var(--info)', bg: 'rgba(59,130,196,.14)' },
};

function paymentMeta(status?: string | null) {
  return PAYMENT_META[status ?? 'PENDIENTE'] ?? PAYMENT_META.PENDIENTE;
}

/**
 * Estados que filtran la lista. Quedan los que tiene una venta registrada por
 * caja: cobrada, entregada sin cobrar (fiado) o anulada.
 *
 * Los intermedios del seguimiento —EN_PREPARACION, LISTO, EN_LOCAL, EN_CAMINO,
 * LLEGO— salieron con el tracking de pedidos. Siguen existiendo en la base
 * porque las ventas viejas los tienen, pero ya no se asignan.
 */
const STATUS_OPTIONS: EstadoPedido[] = [
  'PAGADO',
  'PENDIENTE',
  'ENTREGADO',
  'CANCELADO',
];


const FILTER_OPTIONS: FiltroEstado[] = ['Todos', ...STATUS_OPTIONS];

const STATUS_META: Record<EstadoPedido, { label: string; color: string; bg: string }> = {
  PENDIENTE: { label: 'Pendiente', color: 'var(--amber)', bg: 'rgba(232,163,23,.14)' },
  EN_PREPARACION: { label: 'En preparación', color: 'var(--info)', bg: 'rgba(59,130,196,.14)' },
  LISTO: { label: 'Listo para recoger', color: 'var(--kale)', bg: 'rgba(20,52,42,.12)' },
  EN_LOCAL: { label: 'Repartidor en el local', color: 'var(--info)', bg: 'rgba(59,130,196,.14)' },
  EN_CAMINO: { label: 'En camino', color: 'var(--kale)', bg: 'rgba(20,52,42,.12)' },
  LLEGO: { label: 'Repartidor llegó', color: 'var(--kale)', bg: 'rgba(20,52,42,.12)' },
  ENTREGADO: { label: 'Entregado', color: 'var(--fresh)', bg: 'rgba(31,169,113,.14)' },
  CANCELADO: { label: 'Cancelado', color: 'var(--danger)', bg: 'rgba(229,72,77,.14)' },
  PAGADO: { label: 'Pagado', color: 'var(--fresh)', bg: 'rgba(31,169,113,.14)' },
};

const PAYMENT_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  cash: 'Efectivo',
  QR: 'QR',
  qr: 'QR',
  BANCO: 'Transferencia',
  transfer: 'Transferencia',
  TARJETA: 'Tarjeta',
  MIXTO: 'QR + Efectivo',
};

function statusMeta(status: string) {
  return STATUS_META[status as EstadoPedido] ?? { label: status, color: 'var(--slate)', bg: 'var(--canvas)' };
}

function money(value: number) {
  return `Bs. ${new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))}`;
}

function time(value: string) {
  return new Intl.DateTimeFormat('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function OrderStatusBadge({ estado }: { estado: string }) {
  const meta = statusMeta(estado);
  return (
    <span className="order-status-badge" style={{ color: meta.color, background: meta.bg }}>
      {meta.label}
    </span>
  );
}

function FiadoModal({
  pedido,
  onClose,
  onSubmit,
  saving,
}: {
  pedido: Pedido;
  onClose: () => void;
  onSubmit: (vencimiento: string | null) => void;
  saving: boolean;
}) {
  const [vencimiento, setVencimiento] = useState('');
  return (
    <div className="admin-modal-overlay">
      <form
        onSubmit={e => { e.preventDefault(); onSubmit(vencimiento || null); }}
        className="admin-modal compact"
      >
        <div className="admin-modal-header">
          <h2>Registrar como Fiado</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <div className="finance-modal-note">
            Pedido #{pedido.numero_sucursal ?? pedido.id} · {pedido.cliente_nombre ?? 'Sin nombre'} · <strong>Bs. {pedido.total.toFixed(2)}</strong>
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            Se creará una cuenta por cobrar vinculada a este pedido. El cliente podrá pagar luego.
          </p>
          <div className="form-group">
            <label>Fecha límite de pago (opcional)</label>
            <input
              type="date"
              value={vencimiento}
              onChange={e => setVencimiento(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving}>Confirmar fiado</button>
        </div>
      </form>
    </div>
  );
}

function PedidoCard({ pedido, expanded, onToggle, local }: {
  pedido: Pedido;
  expanded: boolean;
  onToggle: () => void;
  local: LocalRecibo | null;
}) {
  const totalItems = pedido.transaccionesDetalles_id.reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
  const payment = PAYMENT_LABELS[pedido.metodo_pago ?? ''] ?? pedido.metodo_pago ?? 'Efectivo';
  const isDelivery = pedido.tipo_entrega === 'DELIVERY';
  const entregaLabel = isDelivery ? '🛵 Delivery' : '🏪 Recoger en local';
  const pago = paymentMeta(pedido.payment_status);

  return (
    <div className={`order-card ${expanded ? 'expanded' : ''}`}>
      <button className="order-card-main" onClick={onToggle} type="button">
        <div className="order-card-left">
          {/* Manda el correlativo de la sucursal, que es el que se le dice al
              cliente. El `id` es un contador compartido por todo el negocio: en
              un local nuevo mostraba #2101 solo porque los otros ya vendieron
              2100 veces. Queda como referencia interna. */}
          <span className="order-id">#{pedido.numero_sucursal ?? pedido.id}</span>
          <span className="order-time">{time(pedido.created_at)}</span>
        </div>
        <div className="order-card-center">
          <span className="order-customer">{pedido.cliente_nombre ?? 'Cliente sin nombre'}</span>
          <span className="order-items-count">{entregaLabel} · {totalItems} item{totalItems === 1 ? '' : 's'} · {payment}</span>
        </div>
        <div className="order-card-right">
          <span className="order-total">{money(pedido.total)}</span>
          <OrderStatusBadge estado={pedido.estado} />
          <span className="order-status-badge" style={{ color: pago.color, background: pago.bg }}>{pago.label}</span>
        </div>
        <span className={`order-expand-icon ${expanded ? 'open' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="order-card-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="ocd-section">
              <h4>Items del pedido</h4>
              <div className="ocd-items">
                {pedido.transaccionesDetalles_id.length === 0 ? (
                  <div className="ocd-item">
                    <span className="ocd-item-name">Sin items registrados</span>
                  </div>
                ) : (
                  pedido.transaccionesDetalles_id.map(item => (
                    <div key={item.id} className="ocd-item">
                      <span className="ocd-item-name">{item.producto.nombre}</span>
                      <span className="ocd-item-qty">x{item.cantidad}</span>
                      <span className="ocd-item-price">{money(item.precio_unitario * item.cantidad)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="ocd-meta">
              <div className="ocd-meta-item">
                <span className="ocd-meta-label">Cliente</span>
                <span>{pedido.cliente_nombre ?? 'Sin nombre'}</span>
              </div>
              <div className="ocd-meta-item">
                <span className="ocd-meta-label">Teléfono</span>
                <span>{pedido.cliente_telefono ?? 'Sin teléfono'}</span>
              </div>
              <div className="ocd-meta-item">
                <span className="ocd-meta-label">Tipo de entrega</span>
                <span>{entregaLabel}</span>
              </div>
              {isDelivery && (
                <>
                  <div className="ocd-meta-item">
                    {/* Texto libre que escribe el cliente para guiar al
                        repartidor. El punto exacto de entrega es el del mapa. */}
                    <span className="ocd-meta-label">Indicaciones de entrega</span>
                    <span>{pedido.cliente_direccion || 'Sin indicaciones'}</span>
                  </div>
                  <div className="ocd-meta-item">
                    <span className="ocd-meta-label">Repartidor</span>
                    <span>{pedido.driver_nombre ?? (pedido.driver_link_id ? `Link ${pedido.driver_link_id}` : 'Sin asignar')}</span>
                  </div>
                </>
              )}
            </div>

            {/* La nota del cliente va destacada y no como un dato más de la
                grilla: es una instrucción para preparar el pedido y pasarla por
                alto es un reclamo. */}
            {pedido.notas && (
              <div className="ocd-nota">
                <span className="ocd-meta-label">Nota del cliente</span>
                <p>{pedido.notas}</p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <BotonRecibo datos={desdeTransaccion(pedido as unknown as TransaccionRecibo, local)} />
            </div>

            {/* Solo lectura: la venta ya está cobrada y registrada por caja.
                Los estados intermedios (en preparación, en camino, repartidor
                llegó…) se eliminaron con el seguimiento de pedidos. */}
            <div className="ocd-actions">
              <span className="ocd-actions-label">Estado:</span>
              <div className="ocd-status-btns">
                <span className="order-status-badge" style={{ color: statusMeta(pedido.estado).color, background: statusMeta(pedido.estado).bg }}>{statusMeta(pedido.estado).label}</span>
                <span className="order-status-badge" style={{ color: pago.color, background: pago.bg }}>{pago.label}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AdminOrders({ readOnly = false }: { readOnly?: boolean }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('Todos');
  const [busqueda, setBusqueda] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [fiadoPedido, setFiadoPedido] = useState<Pedido | null>(null);
  const [fiadoError, setFiadoError] = useState('');
  const [actionError, setActionError] = useState('');
  const crearFiado = useCrearFiado();

  // Los pedidos son los del local elegido en el panel: cada sucursal prepara
  // y entrega los suyos.
  const { sucursal } = useSucursalAdmin();
  // Encabezado del recibo: cada pedido se imprime con los datos de SU local.
  const { localDe } = useLocalesRecibo();

  const fetchPedidos = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/pedidos${sucursal ? `?sucursal=${sucursal}` : ''}`);
      setPedidos(res.data?.data ?? []);
    } catch (err) {
      console.error(err);
      setPedidos([]);
    } finally {
      setLoading(false);
    }
  }, [sucursal]);

  useEffect(() => {
    fetchPedidos();
    const interval = window.setInterval(fetchPedidos, 20000);
    return () => window.clearInterval(interval);
  }, [fetchPedidos]);

  const counts = useMemo(() => {
    return FILTER_OPTIONS.reduce((acc, status) => {
      acc[status] = status === 'Todos' ? pedidos.length : pedidos.filter(p => p.estado === status).length;
      return acc;
    }, {} as Record<FiltroEstado, number>);
  }, [pedidos]);

  const pedidosFiltrados = pedidos.filter(pedido => {
    const estadoOk = filtroEstado === 'Todos' || pedido.estado === filtroEstado;
    const query = busqueda.trim().toLowerCase();
    const searchOk = !query
      || String(pedido.id).includes(query)
      || (pedido.cliente_nombre ?? '').toLowerCase().includes(query)
      || (pedido.cliente_telefono ?? '').toLowerCase().includes(query);
    return estadoOk && searchOk;
  });

  // Muestra el motivo real que devuelve el backend (ej. fiado con deuda → 409)
  const mostrarErrorAccion = (err: unknown, fallback: string) => {
    const e = err as { response?: { data?: { error?: string; message?: string } } };
    setActionError(e?.response?.data?.error ?? e?.response?.data?.message ?? fallback);
    window.setTimeout(() => setActionError(''), 8000);
  };


  const handleFiado = async (vencimiento: string | null) => {
    if (!fiadoPedido) return;
    setFiadoError('');
    crearFiado.mutate(
      { transaccion_id: fiadoPedido.id, vencimiento: vencimiento || null },
      {
        onSuccess: () => setFiadoPedido(null),
        onError: (err: any) => {
          setFiadoError(err?.response?.data?.message ?? err?.response?.data?.error ?? 'No se pudo registrar el fiado.');
        },
      },
    );
  };


  return (
    <div className="admin-orders">
      <div className="admin-page-header">
        <div>
          <h1>Pedidos</h1>
          <p>{pedidos.length} pedidos totales{readOnly ? ' · solo lectura (los gestiona Caja)' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <BotonExportarExcel url={`/api/admin/ventas/export${sucursal ? `?sucursal=${sucursal}` : ''}`} />
          <button className="admin-btn secondary" onClick={fetchPedidos} type="button">
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {actionError && (
        <div role="alert" style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(220, 53, 69, 0.08)', border: '1px solid var(--danger, #dc3545)',
          color: 'var(--danger, #dc3545)', fontWeight: 600, fontSize: '0.9rem',
        }}>
          {actionError}
        </div>
      )}

      <div className="admin-filters">
        <div className="admin-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            value={busqueda}
            onChange={event => setBusqueda(event.target.value)}
            placeholder="Buscar pedido, cliente o teléfono..."
          />
        </div>
      </div>

      <div className="order-status-bar">
        {FILTER_OPTIONS.map(status => {
          const active = filtroEstado === status;
          const meta = status === 'Todos' ? null : STATUS_META[status];
          return (
            <button
              key={status}
              className={`osb-btn ${active ? 'active' : ''}`}
              onClick={() => setFiltroEstado(status)}
              style={active && meta ? { borderColor: meta.color } : {}}
              type="button"
            >
              {meta && <span className="osb-dot" style={{ background: meta.color }} />}
              {status === 'Todos' ? 'Todos' : meta?.label}
              <span className="osb-count">{counts[status] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {loading && pedidos.length === 0 ? (
        <div className="empty-state">
          <h4>Cargando pedidos</h4>
          <p>Consultando las órdenes recientes.</p>
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="empty-state">
          <h4>Aún no hay pedidos</h4>
          <p>{filtroEstado === 'Todos' ? 'Los pedidos nuevos aparecerán aquí.' : `No hay pedidos en estado ${statusMeta(filtroEstado).label}.`}</p>
        </div>
      ) : (
        <div className="orders-list">
          {pedidosFiltrados.map(pedido => (
            <PedidoCard
              key={pedido.id}
              pedido={pedido}
              local={localDe(pedido.sucursal_id)}
              expanded={expandedId === pedido.id}
              onToggle={() => setExpandedId(current => current === pedido.id ? null : pedido.id)}
            />
          ))}
        </div>
      )}

      {fiadoPedido && (
        <FiadoModal
          pedido={fiadoPedido}
          onClose={() => { setFiadoPedido(null); setFiadoError(''); }}
          onSubmit={handleFiado}
          saving={crearFiado.isPending}
        />
      )}
      {fiadoError && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--danger)', color: '#fff', padding: '10px 18px', borderRadius: 8, zIndex: 9999 }}>
          {fiadoError}
          <button style={{ marginLeft: 10, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} onClick={() => setFiadoError('')}>×</button>
        </div>
      )}
    </div>
  );
}

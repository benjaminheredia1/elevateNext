'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ===== Types ===== */
interface DetalleItem {
  id: number;
  cantidad: number;
  precio_unitario: number;
  descuentoAplicado: number;
  producto: { nombre: string };
}

interface Pedido {
  id: number;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cliente_direccion: string | null;
  metodo_pago: string | null;
  total: number;
  estado: string;
  created_at: string;
  driver_link_id?: string | null;
  transaccionesDetalles_id: DetalleItem[];
}

const ESTADOS = ['Todos', 'PENDIENTE', 'EN_PREPARACION', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'] as const;

const ESTADO_META: Record<string, { label: string; color: string; bg: string }> = {
  PENDIENTE:       { label: 'Pendiente',    color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  EN_PREPARACION:  { label: 'Preparando',   color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  EN_CAMINO:       { label: 'En camino',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
  ENTREGADO:       { label: 'Entregado',    color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  CANCELADO:       { label: 'Cancelado',    color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
  PAGADO:          { label: 'Pagado',       color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
};

const PAGO_ICONS: Record<string, string> = {
  cash: '💵', EFECTIVO: '💵', transfer: '🏦', BANCO: '🏦', qr: '📱', QR: '📱', TARJETA: '💳',
};

function EstadoBadge({ estado }: { estado: string }) {
  const meta = ESTADO_META[estado] ?? { label: estado, color: '#888', bg: 'rgba(136,136,136,0.15)' };
  return (
    <span style={{
      fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 600,
      color: meta.color, background: meta.bg,
    }}>
      {meta.label}
    </span>
  );
}

function PedidoCard({ pedido, onEstadoChange, onDelete }: {
  pedido: Pedido;
  onEstadoChange: (id: number, estado: string) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);

  const SIGUIENTE_ESTADOS = ['PENDIENTE', 'EN_PREPARACION', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'];

  const handleEstado = async (nuevoEstado: string) => {
    setUpdating(true);
    await onEstadoChange(pedido.id, nuevoEstado);
    setUpdating(false);
  };

  const handleGenerateDriverLink = async (ev: React.MouseEvent) => {
    ev.stopPropagation();
    setUpdating(true);
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generar_driver_link: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const link = `${window.location.origin}/driver/${data.data.driver_link_id}`;
        await navigator.clipboard.writeText(link);
        alert('Link copiado al portapapeles:\n' + link);
        // Optimistically update the UI to show it has a link
        pedido.driver_link_id = data.data.driver_link_id; 
      }
    } catch (err) {
      console.error(err);
      alert('Error al generar link');
    }
    setUpdating(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <div
        style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: 'rgba(255,92,25,0.15)', border: '1px solid rgba(255,92,25,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#ff5c19', fontWeight: 700, fontSize: 13,
        }}>
          #{pedido.id}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
            {pedido.cliente_nombre ?? 'Cliente sin nombre'}
          </div>
          <div style={{ color: '#666', fontSize: 12, display: 'flex', gap: 8 }}>
            {pedido.cliente_telefono && <span>📞 {pedido.cliente_telefono}</span>}
            <span>{PAGO_ICONS[pedido.metodo_pago ?? 'cash']} {pedido.metodo_pago ?? 'Efectivo'}</span>
            <span>🕒 {new Date(pedido.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#ff5c19', fontWeight: 700, fontSize: 15 }}>Bs. {pedido.total}</span>
          <EstadoBadge estado={pedido.estado} />
          <span style={{ color: '#555', fontSize: 12, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Items */}
              <div>
                <div style={{ color: '#888', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Items del pedido
                </div>
                {pedido.transaccionesDetalles_id.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#ccc', fontSize: 13 }}>
                      {item.producto.nombre} <span style={{ color: '#666' }}>x{item.cantidad}</span>
                    </span>
                    <span style={{ color: '#fff', fontSize: 13 }}>Bs. {(item.precio_unitario * item.cantidad).toFixed(2)}</span>
                  </div>
                ))}
                {pedido.cliente_direccion && (
                  <div style={{ marginTop: 10, color: '#888', fontSize: 12 }}>
                    📍 {pedido.cliente_direccion}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div>
                <div style={{ color: '#888', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Cambiar estado
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SIGUIENTE_ESTADOS.map(e => {
                    const meta = ESTADO_META[e];
                    const isActive = pedido.estado === e;
                    return (
                      <motion.button
                        key={e}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={(ev) => { ev.stopPropagation(); handleEstado(e); }}
                        disabled={updating || isActive}
                        style={{
                          padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: isActive ? 'default' : 'pointer',
                          background: isActive ? meta.bg : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${isActive ? meta.color + '60' : 'rgba(255,255,255,0.08)'}`,
                          color: isActive ? meta.color : '#888',
                          display: 'flex', alignItems: 'center', gap: 6,
                          transition: 'all 0.15s',
                        }}
                      >
                        {isActive && <span>●</span>} {meta.label}
                      </motion.button>
                    );
                  })}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleGenerateDriverLink}
                    disabled={updating}
                    style={{
                      marginTop: 4, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: pedido.driver_link_id ? 'rgba(16,185,129,0.08)' : 'rgba(59,130,246,0.08)', 
                      border: `1px solid ${pedido.driver_link_id ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)'}`,
                      color: pedido.driver_link_id ? '#10b981' : '#3b82f6',
                    }}
                  >
                    {pedido.driver_link_id ? '📋 Copiar Link Repartidor' : '🛵 Generar Link Repartidor'}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={(ev) => { ev.stopPropagation(); onDelete(pedido.id); }}
                    style={{
                      marginTop: 4, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                      color: '#ef4444',
                    }}
                  >
                    🗑️ Eliminar pedido
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AdminOrders() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [busqueda, setBusqueda] = useState('');

  const fetchPedidos = useCallback(async () => {
    try {
      const res = await fetch('/api/pedidos');
      const data = await res.json();
      setPedidos(data.data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPedidos();
    const interval = setInterval(fetchPedidos, 20000); // refresh every 20s
    return () => clearInterval(interval);
  }, [fetchPedidos]);

  const handleEstadoChange = async (id: number, estado: string) => {
    try {
      const res = await fetch(`/api/pedidos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      if (res.ok) {
        setPedidos(prev => prev.map(p => p.id === id ? { ...p, estado } : p));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este pedido?')) return;
    try {
      await fetch(`/api/pedidos/${id}`, { method: 'DELETE' });
      setPedidos(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSimulate = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_nombre: `Cliente Simulado ${Math.floor(Math.random() * 1000)}`,
          cliente_telefono: `+591 7${Math.floor(Math.random() * 10000000)}`,
          cliente_direccion: 'Dirección simulada de prueba',
          cliente_lat: -17.7710 + (Math.random() - 0.5) * 0.05,
          cliente_lng: -63.1900 + (Math.random() - 0.5) * 0.05,
          metodo_pago: 'EFECTIVO',
          items: [
            { nombre: 'Bowl Proteico Andino', cantidad: 1, precio: 45 }
          ],
          total: 45
        })
      });
      if (res.ok) {
        await fetchPedidos();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const pedidosFiltrados = pedidos.filter(p => {
    const estadoOk = filtroEstado === 'Todos' || p.estado === filtroEstado;
    const busquedaOk = !busqueda ||
      p.cliente_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.cliente_telefono?.includes(busqueda) ||
      String(p.id).includes(busqueda);
    return estadoOk && busquedaOk;
  });

  const conteos = ESTADOS.reduce((acc, e) => {
    acc[e] = e === 'Todos' ? pedidos.length : pedidos.filter(p => p.estado === e).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>
          Pedidos
          {loading && (
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{ marginLeft: 10, fontSize: 12, color: '#ff5c19' }}
            >● actualizando</motion.span>
          )}
        </h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSimulate}
            style={{
              background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)',
              color: '#10b981', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Simular Pedido
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchPedidos}
            style={{
              background: 'rgba(255,92,25,0.15)', border: '1px solid rgba(255,92,25,0.3)',
              color: '#ff5c19', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ↻ Actualizar
        </motion.button>
        </div>
      </div>

      {/* Search */}
      <input
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre, teléfono o #pedido..."
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
        }}
      />

      {/* Estado filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {ESTADOS.map(e => {
          const meta = e !== 'Todos' ? ESTADO_META[e] : null;
          const isActive = filtroEstado === e;
          return (
            <motion.button
              key={e}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setFiltroEstado(e)}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: isActive ? (meta?.bg ?? 'rgba(255,92,25,0.15)') : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isActive ? (meta?.color ?? '#ff5c19') + '60' : 'rgba(255,255,255,0.08)'}`,
                color: isActive ? (meta?.color ?? '#ff5c19') : '#888',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {e === 'Todos' ? 'Todos' : (meta?.label ?? e)}
              <span style={{
                background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                borderRadius: 6, padding: '1px 5px', fontSize: 10,
              }}>
                {conteos[e] ?? 0}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Orders list */}
      {loading && pedidos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            style={{ width: 32, height: 32, border: '3px solid #ff5c19', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 12px' }}
          />
          Cargando pedidos...
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14 }}>No hay pedidos {filtroEstado !== 'Todos' ? `con estado "${ESTADO_META[filtroEstado]?.label}"` : ''}</div>
        </div>
      ) : (
        <AnimatePresence>
          {pedidosFiltrados.map(pedido => (
            <PedidoCard
              key={pedido.id}
              pedido={pedido}
              onEstadoChange={handleEstadoChange}
              onDelete={handleDelete}
            />
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}

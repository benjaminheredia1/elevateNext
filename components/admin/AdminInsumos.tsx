'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Insumo {
  id: number;
  nombre: string;
  stock_actual: number;
  stock_minimo: number;
  unidad_medida: string;
  nivel?: 'critico' | 'advertencia' | 'ok';
  porcentaje?: number;
}

interface Movimiento {
  id: number;
  tipo_movimiento: string;
  cantidad: number;
  descripcion: string;
  created_at: string;
  insumo: { nombre: string };
}

const NIVEL_META = {
  critico:    { label: 'Crítico',     color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   barColor: '#ef4444' },
  advertencia:{ label: 'Advertencia', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  barColor: '#f59e0b' },
  ok:         { label: 'OK',          color: '#10b981', bg: 'rgba(16,185,129,0.15)',  barColor: '#10b981' },
};

function StockBar({ porcentaje, nivel }: { porcentaje: number; nivel: string }) {
  const meta = NIVEL_META[nivel as keyof typeof NIVEL_META] ?? NIVEL_META.ok;
  return (
    <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, porcentaje)}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{ height: '100%', background: meta.barColor, borderRadius: 4 }}
      />
    </div>
  );
}

function MovimientoModal({ insumo, onClose, onSuccess }: {
  insumo: Insumo;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tipo, setTipo] = useState<'INGRESO' | 'EGRESO'>('INGRESO');
  const [cantidad, setCantidad] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const handleSubmit = async () => {
    if (!cantidad || parseFloat(cantidad) <= 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/insumo/movimiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insumo_id: insumo.id,
          tipo_movimiento: tipo,
          cantidad: parseFloat(cantidad),
          descripcion: descripcion || `${tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'} manual`,
        }),
      });
      const data = await res.json();
      if (data.alerta) setMensaje(data.alerta);
      else {
        onSuccess();
        onClose();
      }
    } catch {
      setMensaje('Error al registrar movimiento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20, padding: 28, width: 380, maxWidth: '90vw',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          Registrar Movimiento
        </h3>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>{insumo.nombre}</p>

        {/* Stock actual */}
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#888', fontSize: 13 }}>Stock actual</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>
              {insumo.stock_actual} {insumo.unidad_medida}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ color: '#888', fontSize: 13 }}>Stock mínimo</span>
            <span style={{ color: '#888', fontSize: 13 }}>
              {insumo.stock_minimo} {insumo.unidad_medida}
            </span>
          </div>
        </div>

        {/* Type selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {(['INGRESO', 'EGRESO'] as const).map(t => (
            <motion.button
              key={t}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setTipo(t)}
              style={{
                padding: '10px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                background: tipo === t
                  ? (t === 'INGRESO' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)')
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tipo === t
                  ? (t === 'INGRESO' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)')
                  : 'rgba(255,255,255,0.08)'}`,
                color: tipo === t ? (t === 'INGRESO' ? '#10b981' : '#ef4444') : '#888',
              }}
            >
              {t === 'INGRESO' ? '⬆️ Ingreso' : '⬇️ Egreso'}
            </motion.button>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>
            Cantidad ({insumo.unidad_medida})
          </label>
          <input
            type="number"
            value={cantidad}
            onChange={e => setCantidad(e.target.value)}
            min="0"
            step="0.1"
            placeholder={`Ej: 5`}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10, boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff', fontSize: 14, outline: 'none',
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>
            Descripción (opcional)
          </label>
          <input
            type="text"
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="Ej: Compra del proveedor XYZ"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10, boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff', fontSize: 14, outline: 'none',
            }}
          />
        </div>

        {mensaje && (
          <div style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#f59e0b', fontSize: 13 }}>
            {mensaje}
            <button onClick={() => { setMensaje(''); onSuccess(); onClose(); }} style={{ marginLeft: 8, color: '#10b981', cursor: 'pointer', background: 'none', border: 'none', fontSize: 12 }}>
              Continuar →
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#888', fontSize: 13, fontWeight: 600,
            }}
          >
            Cancelar
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={loading || !cantidad}
            style={{
              flex: 2, padding: '11px', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer',
              background: tipo === 'INGRESO' ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)',
              border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
              opacity: !cantidad ? 0.6 : 1,
            }}
          >
            {loading ? '...' : `Registrar ${tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'}`}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function AdminInsumos() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInsumo, setSelectedInsumo] = useState<Insumo | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'critico' | 'advertencia' | 'ok'>('todos');

  const fetchData = useCallback(async () => {
    try {
      const [alertasRes, movRes] = await Promise.all([
        fetch('/api/alertas'),
        fetch('/api/insumo/movimiento'),
      ]);
      const alertasData = await alertasRes.json();
      const movData = await movRes.json();
      setInsumos(alertasData.data?.resumen ?? []);
      setMovimientos(movData.data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const insumosFiltrados = insumos.filter(i =>
    filtro === 'todos' ? true : i.nivel === filtro
  );

  const counts = {
    critico: insumos.filter(i => i.nivel === 'critico').length,
    advertencia: insumos.filter(i => i.nivel === 'advertencia').length,
    ok: insumos.filter(i => i.nivel === 'ok').length,
  };

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>
          Insumos
          {counts.critico > 0 && (
            <motion.span
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{ marginLeft: 10, fontSize: 13, color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: 6 }}
            >
              ⚠️ {counts.critico} crítico{counts.critico > 1 ? 's' : ''}
            </motion.span>
          )}
        </h1>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={fetchData}
          style={{
            background: 'rgba(255,92,25,0.15)', border: '1px solid rgba(255,92,25,0.3)',
            color: '#ff5c19', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ↻ Actualizar
        </motion.button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'todos', label: 'Todos', count: insumos.length },
          { key: 'critico', label: '🔴 Crítico', count: counts.critico },
          { key: 'advertencia', label: '🟡 Advertencia', count: counts.advertencia },
          { key: 'ok', label: '🟢 OK', count: counts.ok },
        ].map(f => (
          <motion.button
            key={f.key}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setFiltro(f.key as typeof filtro)}
            style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: filtro === f.key ? 'rgba(255,92,25,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${filtro === f.key ? 'rgba(255,92,25,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: filtro === f.key ? '#ff5c19' : '#888',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {f.label}
            <span style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 6, padding: '1px 5px', fontSize: 10 }}>
              {f.count}
            </span>
          </motion.button>
        ))}
      </div>

      {/* Insumos grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            style={{ width: 32, height: 32, border: '3px solid #ff5c19', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 12px' }}
          />
          Cargando insumos...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 32 }}>
          <AnimatePresence>
            {insumosFiltrados.map((insumo, i) => {
              const meta = NIVEL_META[insumo.nivel ?? 'ok'];
              return (
                <motion.div
                  key={insumo.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.04 }}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${insumo.nivel === 'critico' ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 16, padding: '18px 20px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{insumo.nombre}</div>
                      <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>{insumo.unidad_medida}</div>
                    </div>
                    <span style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 600,
                      color: meta.color, background: meta.bg,
                    }}>
                      {meta.label}
                    </span>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: '#aaa', fontSize: 12 }}>
                        Stock: <strong style={{ color: '#fff' }}>{insumo.stock_actual} {insumo.unidad_medida}</strong>
                      </span>
                      <span style={{ color: '#666', fontSize: 12 }}>
                        Mín: {insumo.stock_minimo}
                      </span>
                    </div>
                    <StockBar porcentaje={insumo.porcentaje ?? 0} nivel={insumo.nivel ?? 'ok'} />
                  </div>

                  {insumo.nivel === 'critico' && (
                    <motion.div
                      animate={{ opacity: [1, 0.7, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      style={{ fontSize: 11, color: '#ef4444', marginBottom: 10 }}
                    >
                      ⚠️ Stock por debajo del mínimo — requiere reposición
                    </motion.div>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedInsumo(insumo)}
                    style={{
                      width: '100%', padding: '9px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      background: 'rgba(255,92,25,0.1)', border: '1px solid rgba(255,92,25,0.2)',
                      color: '#ff5c19', transition: 'all 0.15s',
                    }}
                  >
                    + Registrar movimiento
                  </motion.button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Recent movements */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: '20px 24px',
      }}>
        <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          Historial de Movimientos
        </h3>
        {movimientos.length === 0 ? (
          <p style={{ color: '#666', fontSize: 13 }}>Sin movimientos registrados.</p>
        ) : (
          movimientos.slice(0, 20).map((m, i) => (
            <div
              key={m.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0',
                borderBottom: i < movimientos.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: m.tipo_movimiento === 'INGRESO' ? 'rgba(16,185,129,0.15)' :
                             m.tipo_movimiento === 'PRODUCCION' ? 'rgba(59,130,246,0.15)' :
                             'rgba(239,68,68,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14,
              }}>
                {m.tipo_movimiento === 'INGRESO' ? '⬆️' : m.tipo_movimiento === 'PRODUCCION' ? '🍳' : '⬇️'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#ddd', fontSize: 13, fontWeight: 500 }}>{m.insumo?.nombre}</div>
                <div style={{ color: '#666', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.descripcion}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontWeight: 700, fontSize: 13,
                  color: m.tipo_movimiento === 'INGRESO' ? '#10b981' : '#ef4444',
                }}>
                  {m.tipo_movimiento === 'INGRESO' ? '+' : '-'}{m.cantidad}
                </div>
                <div style={{ color: '#555', fontSize: 10 }}>
                  {new Date(m.created_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Movement Modal */}
      <AnimatePresence>
        {selectedInsumo && (
          <MovimientoModal
            insumo={selectedInsumo}
            onClose={() => setSelectedInsumo(null)}
            onSuccess={fetchData}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

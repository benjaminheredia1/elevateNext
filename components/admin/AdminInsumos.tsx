'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '@/hooks/api';

/* ─────────────────────── tipos ─────────────────────── */
interface Insumo {
  id: number;
  nombre: string;
  stock_actual: number;
  stock_minimo: number;
  punto_critico: number;
  unidad_medida: string;
  costo_promedio: number;
  uso_diario_promedio: number | null;
  categoria_insumo: string | null;
  proveedor: string | null;
  estado: 'ok' | 'bajo' | 'critico' | 'agotado';
}

interface Movimiento {
  id: number;
  tipo_movimiento: string;
  cantidad: number;
  descripcion: string;
  costo_unitario: number | null;
  created_at: string;
  insumo: { nombre: string; unidad_medida: string };
}

/* ─────────────────────── paleta ─────────────────────── */
const NIVEL_META = {
  ok:      { label: 'OK',         color: '#10b981', bg: 'rgba(16,185,129,0.15)',  barColor: '#10b981' },
  bajo:    { label: 'Bajo',       color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  barColor: '#f59e0b' },
  critico: { label: 'Crítico',    color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   barColor: '#ef4444' },
  agotado: { label: 'Agotado',    color: '#6b7280', bg: 'rgba(107,114,128,0.15)', barColor: '#6b7280' },
};

const TIPO_MOV_COLOR: Record<string, string> = {
  INGRESO:   '#10b981',
  VENTA:     '#3b82f6',
  MERMA:     '#ef4444',
  AJUSTE:    '#a855f7',
  EGRESO:    '#f59e0b',
  PRODUCCION:'#06b6d4',
};

/* ─────────────────────── helpers ─────────────────────── */
function inputStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: 10, boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff', fontSize: 14, outline: 'none',
  };
}

function dias(insumo: Insumo): string {
  if (!insumo.uso_diario_promedio || insumo.uso_diario_promedio <= 0) return '—';
  const d = Math.floor(insumo.stock_actual / insumo.uso_diario_promedio);
  return `${d}d`;
}

/* ─────────────────────── Modal genérico ─────────────────────── */
function ModalWrap({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20, padding: 28, width: 420, maxWidth: '95vw',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────── Modal Compra ─────────────────────── */
function CompraModal({ insumo, onClose, onSuccess }: { insumo: Insumo; onClose: () => void; onSuccess: () => void }) {
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [nota, setNota] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!cantidad || !costo) return;
    setLoading(true); setError('');
    try {
      await apiClient.post('/api/admin/insumos/compra', {
        insumo_id: insumo.id,
        cantidad: parseFloat(cantidad),
        costo_unitario: parseFloat(costo),
        nota: nota || undefined,
      });
      onSuccess(); onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Error al registrar compra');
    } finally { setLoading(false); }
  };

  return (
    <ModalWrap onClose={onClose}>
      <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>🛒 Registrar Compra</h3>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>{insumo.nombre} · Stock actual: {insumo.stock_actual} {insumo.unidad_medida}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Cantidad ({insumo.unidad_medida})</label>
          <input type="number" min="0" step="0.1" value={cantidad} onChange={e => setCantidad(e.target.value)} placeholder="Ej: 10" style={inputStyle()} />
        </div>
        <div>
          <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Costo unitario (Bs)</label>
          <input type="number" min="0" step="0.01" value={costo} onChange={e => setCosto(e.target.value)} placeholder="Ej: 15.50" style={inputStyle()} />
        </div>
      </div>

      {cantidad && costo && (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
          <span style={{ color: '#888' }}>Total compra: </span>
          <span style={{ color: '#10b981', fontWeight: 700 }}>Bs {(parseFloat(cantidad) * parseFloat(costo)).toFixed(2)}</span>
          <span style={{ color: '#666', marginLeft: 12 }}>Nuevo stock estimado: {(insumo.stock_actual + parseFloat(cantidad)).toFixed(2)} {insumo.unidad_medida}</span>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Nota (opcional)</label>
        <input type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Proveedor, lote…" style={inputStyle()} />
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#888', fontWeight: 600 }}>Cancelar</button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={submit} disabled={loading || !cantidad || !costo}
          style={{ flex: 2, padding: 11, borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', color: '#fff', fontWeight: 700, opacity: (!cantidad || !costo) ? 0.6 : 1 }}>
          {loading ? '...' : 'Registrar Compra'}
        </motion.button>
      </div>
    </ModalWrap>
  );
}

/* ─────────────────────── Modal Merma ─────────────────────── */
function MermaModal({ insumo, onClose, onSuccess }: { insumo: Insumo; onClose: () => void; onSuccess: () => void }) {
  const [cantidad, setCantidad] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!cantidad) return;
    setLoading(true); setError('');
    try {
      await apiClient.post('/api/admin/insumos/merma', {
        insumo_id: insumo.id, cantidad: parseFloat(cantidad),
        descripcion: descripcion || `Merma de ${insumo.nombre}`,
      });
      onSuccess(); onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Error al registrar merma');
    } finally { setLoading(false); }
  };

  return (
    <ModalWrap onClose={onClose}>
      <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>⚠️ Registrar Merma</h3>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>{insumo.nombre} · Stock actual: {insumo.stock_actual} {insumo.unidad_medida}</p>
      <div style={{ marginBottom: 12 }}>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Cantidad a dar de baja ({insumo.unidad_medida})</label>
        <input type="number" min="0" step="0.1" value={cantidad} onChange={e => setCantidad(e.target.value)} placeholder="Ej: 2.5" style={inputStyle()} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Motivo</label>
        <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Caducidad, deterioro…" style={inputStyle()} />
      </div>
      {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#888', fontWeight: 600 }}>Cancelar</button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={submit} disabled={loading || !cantidad}
          style={{ flex: 2, padding: 11, borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#ef4444,#dc2626)', border: 'none', color: '#fff', fontWeight: 700, opacity: !cantidad ? 0.6 : 1 }}>
          {loading ? '...' : 'Registrar Merma'}
        </motion.button>
      </div>
    </ModalWrap>
  );
}

/* ─────────────────────── Modal Conteo Físico ─────────────────────── */
function ConteoModal({ insumo, onClose, onSuccess }: { insumo: Insumo; onClose: () => void; onSuccess: () => void }) {
  const [nuevoStock, setNuevoStock] = useState(String(insumo.stock_actual));
  const [descripcion, setDescripcion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const varianza = parseFloat(nuevoStock) - insumo.stock_actual;

  const submit = async () => {
    setLoading(true); setError('');
    try {
      await apiClient.post('/api/admin/insumos/conteo', {
        insumo_id: insumo.id, nuevo_stock: parseFloat(nuevoStock),
        descripcion: descripcion || undefined,
      });
      onSuccess(); onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Error al registrar conteo');
    } finally { setLoading(false); }
  };

  return (
    <ModalWrap onClose={onClose}>
      <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>📋 Conteo Físico</h3>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>{insumo.nombre} · Sistema: {insumo.stock_actual} {insumo.unidad_medida}</p>
      <div style={{ marginBottom: 12 }}>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Stock real contado ({insumo.unidad_medida})</label>
        <input type="number" min="0" step="0.1" value={nuevoStock} onChange={e => setNuevoStock(e.target.value)} style={inputStyle()} />
      </div>
      {!isNaN(varianza) && (
        <div style={{ background: varianza >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${varianza >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
          Varianza: <strong style={{ color: varianza >= 0 ? '#10b981' : '#ef4444' }}>{varianza >= 0 ? '+' : ''}{varianza.toFixed(2)} {insumo.unidad_medida}</strong>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Nota (opcional)</label>
        <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Conteo turno tarde…" style={inputStyle()} />
      </div>
      {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#888', fontWeight: 600 }}>Cancelar</button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={submit} disabled={loading}
          style={{ flex: 2, padding: 11, borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', border: 'none', color: '#fff', fontWeight: 700 }}>
          {loading ? '...' : 'Guardar Conteo'}
        </motion.button>
      </div>
    </ModalWrap>
  );
}

type ModalTipo = 'compra' | 'merma' | 'conteo' | null;

/* ─────────────────────── Componente principal ─────────────────────── */
export default function AdminInsumos() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Insumo | null>(null);
  const [modalTipo, setModalTipo] = useState<ModalTipo>(null);
  const [filtro, setFiltro] = useState<'todos' | 'ok' | 'bajo' | 'critico' | 'agotado'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [alertasRes, movRes] = await Promise.all([
        apiClient.get('/api/admin/alertas'),
        apiClient.get('/api/insumo/movimiento'),
      ]);
      // Combinar insumos bajo umbral + todos los insumos desde el endpoint de alertas
      // El endpoint devuelve {insumos_bajo_umbral, historial}
      // Para todos los insumos usamos el endpoint existente
      const todosRes = await apiClient.get('/api/alertas');
      const todosData: Insumo[] = (todosRes.data?.data?.resumen ?? []).map((i: any) => ({
        ...i,
        estado: i.nivel === 'critico' ? 'critico'
               : i.nivel === 'advertencia' ? 'bajo'
               : i.stock_actual <= 0 ? 'agotado' : 'ok',
        punto_critico: i.punto_critico ?? 0,
        costo_promedio: i.costo_promedio ?? 0,
        uso_diario_promedio: i.uso_diario_promedio ?? null,
        categoria_insumo: i.categoria_insumo ?? null,
        proveedor: i.proveedor ?? null,
      }));
      setInsumos(todosData);
      setMovimientos(movRes.data?.data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const abrirModal = (insumo: Insumo, tipo: ModalTipo) => {
    setSelected(insumo);
    setModalTipo(tipo);
  };

  const cerrarModal = () => { setSelected(null); setModalTipo(null); };

  const categorias = Array.from(new Set(insumos.map(i => i.categoria_insumo).filter(Boolean))) as string[];

  const filtrados = insumos
    .filter(i => filtro === 'todos' ? true : i.estado === filtro)
    .filter(i => !categoria || i.categoria_insumo === categoria)
    .filter(i => !busqueda || i.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  const counts = {
    ok: insumos.filter(i => i.estado === 'ok').length,
    bajo: insumos.filter(i => i.estado === 'bajo').length,
    critico: insumos.filter(i => i.estado === 'critico').length,
    agotado: insumos.filter(i => i.estado === 'agotado').length,
  };

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>
            Inventario
            {counts.critico > 0 && (
              <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                style={{ marginLeft: 10, fontSize: 13, color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: 6 }}>
                ⚠️ {counts.critico} crítico{counts.critico > 1 ? 's' : ''}
              </motion.span>
            )}
          </h1>
          <p style={{ color: '#666', fontSize: 13, marginTop: 2 }}>Gestión de stock, compras, mermas y conteos físicos</p>
        </div>
        <button onClick={fetchData}
          style={{ background: 'rgba(255,92,25,0.15)', border: '1px solid rgba(255,92,25,0.3)', color: '#ff5c19', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ↻ Actualizar
        </button>
      </div>

      {/* KPI Chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          { key: 'todos', label: 'Todos', count: insumos.length, color: '#ff5c19' },
          { key: 'ok', label: '🟢 OK', count: counts.ok, color: '#10b981' },
          { key: 'bajo', label: '🟡 Bajo', count: counts.bajo, color: '#f59e0b' },
          { key: 'critico', label: '🔴 Crítico', count: counts.critico, color: '#ef4444' },
          { key: 'agotado', label: '⚫ Agotado', count: counts.agotado, color: '#6b7280' },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key as typeof filtro)}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: filtro === f.key ? `${f.color}22` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${filtro === f.key ? `${f.color}66` : 'rgba(255,255,255,0.08)'}`,
              color: filtro === f.key ? f.color : '#888', display: 'flex', alignItems: 'center', gap: 6 }}>
            {f.label}
            <span style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 6, padding: '1px 5px', fontSize: 10 }}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input placeholder="Buscar insumo…" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13 }} />
        {categorias.length > 0 && (
          <select value={categoria} onChange={e => setCategoria(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13 }}>
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            style={{ width: 32, height: 32, border: '3px solid #ff5c19', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 12px' }} />
          Cargando inventario…
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 32 }}>
          <AnimatePresence>
            {filtrados.map((insumo, i) => {
              const meta = NIVEL_META[insumo.estado];
              const pct = insumo.stock_minimo > 0
                ? Math.min(100, (insumo.stock_actual / (insumo.stock_minimo * 1.5)) * 100)
                : 100;
              return (
                <motion.div key={insumo.id}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.03 }}
                  style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${insumo.estado === 'critico' ? 'rgba(239,68,68,0.25)' : insumo.estado === 'agotado' ? 'rgba(107,114,128,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 16, padding: '18px 20px' }}>

                  {/* Card header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{insumo.nombre}</div>
                      <div style={{ color: '#555', fontSize: 11, marginTop: 2 }}>
                        {insumo.unidad_medida}{insumo.categoria_insumo ? ` · ${insumo.categoria_insumo}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 700, color: meta.color, background: meta.bg }}>
                      {meta.label}
                    </span>
                  </div>

                  {/* Stock bar */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ color: '#aaa', fontSize: 12 }}>Stock: <strong style={{ color: '#fff' }}>{insumo.stock_actual}</strong></span>
                      <span style={{ color: '#555', fontSize: 11 }}>Mín: {insumo.stock_minimo} · Crit: {insumo.punto_critico}</span>
                    </div>
                    <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                        style={{ height: '100%', background: meta.barColor, borderRadius: 4 }} />
                    </div>
                  </div>

                  {/* Metadata row */}
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11, color: '#666' }}>
                    <span>💰 Bs {insumo.costo_promedio.toFixed(2)}</span>
                    <span>📅 {dias(insumo)}</span>
                    {insumo.proveedor && <span title={insumo.proveedor}>🏪 {insumo.proveedor.slice(0, 12)}</span>}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    {[
                      { label: '🛒', title: 'Compra', tipo: 'compra' as ModalTipo, color: '#10b981' },
                      { label: '⚠️', title: 'Merma', tipo: 'merma' as ModalTipo, color: '#ef4444' },
                      { label: '📋', title: 'Conteo', tipo: 'conteo' as ModalTipo, color: '#a855f7' },
                    ].map(btn => (
                      <motion.button key={btn.tipo} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={() => abrirModal(insumo, btn.tipo)}
                        title={btn.title}
                        style={{ padding: '7px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          background: `${btn.color}15`, border: `1px solid ${btn.color}33`, color: btn.color }}>
                        {btn.label} {btn.title}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filtrados.length === 0 && !loading && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#666' }}>Sin insumos que coincidan con los filtros.</div>
          )}
        </div>
      )}

      {/* Historial de movimientos */}
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 24px' }}>
        <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Historial de Movimientos</h3>
        {movimientos.length === 0 ? (
          <p style={{ color: '#666', fontSize: 13 }}>Sin movimientos registrados.</p>
        ) : (
          movimientos.slice(0, 30).map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: i < Math.min(29, movimientos.length - 1) ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: `${TIPO_MOV_COLOR[m.tipo_movimiento] ?? '#888'}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                {m.tipo_movimiento === 'INGRESO' ? '⬆️' : m.tipo_movimiento === 'VENTA' ? '🍽️' : m.tipo_movimiento === 'MERMA' ? '🗑️' : m.tipo_movimiento === 'AJUSTE' ? '📋' : '⬇️'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#ddd', fontSize: 13, fontWeight: 500 }}>{m.insumo?.nombre}</div>
                <div style={{ color: '#555', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descripcion}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: TIPO_MOV_COLOR[m.tipo_movimiento] ?? '#888' }}>
                  {m.cantidad >= 0 ? '+' : ''}{m.cantidad} {m.insumo?.unidad_medida}
                </div>
                {m.costo_unitario && <div style={{ color: '#555', fontSize: 10 }}>@ Bs {m.costo_unitario}</div>}
                <div style={{ color: '#444', fontSize: 10 }}>
                  {new Date(m.created_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modales */}
      <AnimatePresence>
        {selected && modalTipo === 'compra' && (
          <CompraModal insumo={selected} onClose={cerrarModal} onSuccess={fetchData} />
        )}
        {selected && modalTipo === 'merma' && (
          <MermaModal insumo={selected} onClose={cerrarModal} onSuccess={fetchData} />
        )}
        {selected && modalTipo === 'conteo' && (
          <ConteoModal insumo={selected} onClose={cerrarModal} onSuccess={fetchData} />
        )}
      </AnimatePresence>
    </div>
  );
}

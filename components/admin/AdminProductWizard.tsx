'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '@/hooks/api';

/* ─── tipos ─── */
interface InsumoOpt { id: number; nombre: string; unidad_medida: string; costo_promedio: number; }
interface CategoriaOpt { id: number; nombre: string; }
interface MarcaOpt { id: number; nombre: string; }

interface WizardForm {
  nombre: string;
  descripcion: string;
  precio: number;
  calorias: number | null;
  proteina: number | null;
  tipo: 'ELABORADO' | 'REVENTA';
  estado_publicacion: 'PUBLICADO' | 'BORRADOR';
  disponible: boolean;
  categorias: number[];
  marcas: number[];
  receta: { insumo_id: number; cantidad_utilizada: number }[];
  insumo_reventa_id: number | null;
}

const INIT: WizardForm = {
  nombre: '', descripcion: '', precio: 0, calorias: null, proteina: null,
  tipo: 'ELABORADO', estado_publicacion: 'BORRADOR', disponible: true,
  categorias: [], marcas: [], receta: [], insumo_reventa_id: null,
};

const STEPS = ['Datos básicos', 'Marcas', 'Receta / Insumo', 'Publicación'];

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return { width: '100%', padding: '10px 14px', borderRadius: 10, boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', ...extra };
}

/* ─── Paso 1 ─── */
function Step1({ form, set }: { form: WizardForm; set: (f: Partial<WizardForm>) => void }) {
  const { data } = useQuery({ queryKey: ['categorias-opt'], queryFn: async () => (await apiClient.get('/api/categorias')).data });
  const cats: CategoriaOpt[] = data?.data ?? [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={{ gridColumn: '1/-1' }}>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Nombre *</label>
        <input value={form.nombre} onChange={e => set({ nombre: e.target.value })} placeholder="Ej: Bowl Proteico" style={inputStyle()} />
      </div>
      <div style={{ gridColumn: '1/-1' }}>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Descripción</label>
        <textarea value={form.descripcion} onChange={e => set({ descripcion: e.target.value })} rows={3}
          placeholder="Descripción del producto…" style={{ ...inputStyle(), resize: 'vertical' }} />
      </div>
      <div>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Precio (Bs) *</label>
        <input type="number" min="0" step="0.5" value={form.precio || ''} onChange={e => set({ precio: parseFloat(e.target.value) || 0 })} style={inputStyle()} />
      </div>
      <div>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Tipo</label>
        <select value={form.tipo} onChange={e => set({ tipo: e.target.value as WizardForm['tipo'] })} style={inputStyle()}>
          <option value="ELABORADO">Elaborado (con receta)</option>
          <option value="REVENTA">Reventa (insumo directo)</option>
        </select>
      </div>
      <div>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Calorías</label>
        <input type="number" min="0" value={form.calorias ?? ''} onChange={e => set({ calorias: e.target.value ? parseInt(e.target.value) : null })} style={inputStyle()} />
      </div>
      <div>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>Proteína (g)</label>
        <input type="number" min="0" step="0.1" value={form.proteina ?? ''} onChange={e => set({ proteina: e.target.value ? parseFloat(e.target.value) : null })} style={inputStyle()} />
      </div>
      <div style={{ gridColumn: '1/-1' }}>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 8 }}>Categorías</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {cats.map(c => (
            <button key={c.id} type="button"
              onClick={() => set({ categorias: form.categorias.includes(c.id) ? form.categorias.filter(x => x !== c.id) : [...form.categorias, c.id] })}
              style={{ padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: form.categorias.includes(c.id) ? 'rgba(255,92,25,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${form.categorias.includes(c.id) ? 'rgba(255,92,25,0.5)' : 'rgba(255,255,255,0.1)'}`, color: form.categorias.includes(c.id) ? '#ff5c19' : '#888' }}>
              {c.nombre}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Paso 2 ─── */
function Step2({ form, set }: { form: WizardForm; set: (f: Partial<WizardForm>) => void }) {
  const { data } = useQuery({ queryKey: ['marcas-opt'], queryFn: async () => (await apiClient.get('/api/admin/marcas')).data });
  const marcas: MarcaOpt[] = data?.data ?? data?.items ?? [];

  return (
    <div>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>Selecciona las marcas que aplican a este producto (puede ser ninguna).</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {marcas.map(m => (
          <button key={m.id} type="button"
            onClick={() => set({ marcas: form.marcas.includes(m.id) ? form.marcas.filter(x => x !== m.id) : [...form.marcas, m.id] })}
            style={{ padding: '10px 20px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700,
              background: form.marcas.includes(m.id) ? 'rgba(255,92,25,0.2)' : 'rgba(255,255,255,0.04)',
              border: `2px solid ${form.marcas.includes(m.id) ? '#ff5c19' : 'rgba(255,255,255,0.1)'}`,
              color: form.marcas.includes(m.id) ? '#ff5c19' : '#888' }}>
            {m.nombre}
          </button>
        ))}
        {marcas.length === 0 && <p style={{ color: '#555', fontSize: 13 }}>No hay marcas registradas.</p>}
      </div>
    </div>
  );
}

/* ─── Paso 3 ─── */
function Step3({ form, set }: { form: WizardForm; set: (f: Partial<WizardForm>) => void }) {
  const { data } = useQuery({ queryKey: ['insumos-opt'], queryFn: async () => (await apiClient.get('/api/alertas')).data });
  const insumos: InsumoOpt[] = data?.data?.resumen ?? [];
  const [busq, setBusq] = useState('');
  const [cantidadMap, setCantidadMap] = useState<Record<number, string>>({});

  const filtrados = insumos.filter(i => !busq || i.nombre.toLowerCase().includes(busq.toLowerCase()));
  const costoTotal = form.receta.reduce((s, r) => {
    const ins = insumos.find(i => i.id === r.insumo_id);
    return s + (ins?.costo_promedio ?? 0) * r.cantidad_utilizada;
  }, 0);

  if (form.tipo === 'REVENTA') {
    return (
      <div>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>Selecciona el insumo que se vende directamente (reventa).</p>
        <input placeholder="Buscar insumo…" value={busq} onChange={e => setBusq(e.target.value)}
          style={{ ...inputStyle(), marginBottom: 12 }} />
        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtrados.map(i => (
            <button key={i.id} type="button" onClick={() => set({ insumo_reventa_id: i.id })}
              style={{ padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', background: form.insumo_reventa_id === i.id ? 'rgba(255,92,25,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${form.insumo_reventa_id === i.id ? 'rgba(255,92,25,0.4)' : 'rgba(255,255,255,0.08)'}`, color: form.insumo_reventa_id === i.id ? '#ff5c19' : '#ddd', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{i.nombre}</span>
              <span style={{ color: '#666', fontSize: 11, marginLeft: 8 }}>{i.unidad_medida} · Bs {i.costo_promedio.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const addIngrediente = (ins: InsumoOpt) => {
    const qty = parseFloat(cantidadMap[ins.id] ?? '1');
    if (isNaN(qty) || qty <= 0) return;
    if (form.receta.some(r => r.insumo_id === ins.id)) {
      set({ receta: form.receta.map(r => r.insumo_id === ins.id ? { ...r, cantidad_utilizada: qty } : r) });
    } else {
      set({ receta: [...form.receta, { insumo_id: ins.id, cantidad_utilizada: qty }] });
    }
  };

  return (
    <div>
      {form.receta.length > 0 && (
        <div style={{ background: 'rgba(255,92,25,0.05)', border: '1px solid rgba(255,92,25,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ color: '#888', fontSize: 11, marginBottom: 8 }}>Ingredientes seleccionados ({form.receta.length})</div>
          {form.receta.map(r => {
            const ins = insumos.find(i => i.id === r.insumo_id);
            return (
              <div key={r.insumo_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ color: '#ddd', fontSize: 13 }}>{ins?.nombre} — {r.cantidad_utilizada} {ins?.unidad_medida}</span>
                <button type="button" onClick={() => set({ receta: form.receta.filter(x => x.insumo_id !== r.insumo_id) })}
                  style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            );
          })}
          <div style={{ color: '#ff5c19', fontSize: 12, fontWeight: 700, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>Costo receta: Bs {costoTotal.toFixed(2)} {form.precio > 0 && `· Food cost: ${((costoTotal / form.precio) * 100).toFixed(1)}%`}</div>
        </div>
      )}

      <input placeholder="Buscar insumo…" value={busq} onChange={e => setBusq(e.target.value)}
        style={{ ...inputStyle(), marginBottom: 10 }} />

      <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtrados.map(ins => (
          <div key={ins.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ flex: 1, color: '#ddd', fontSize: 13 }}>{ins.nombre} <span style={{ color: '#555', fontSize: 11 }}>({ins.unidad_medida})</span></span>
            <input type="number" min="0" step="0.1" placeholder="Cant." value={cantidadMap[ins.id] ?? ''}
              onChange={e => setCantidadMap(m => ({ ...m, [ins.id]: e.target.value }))}
              style={{ width: 80, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13 }} />
            <button type="button" onClick={() => addIngrediente(ins)}
              style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: form.receta.some(r => r.insumo_id === ins.id) ? 'rgba(16,185,129,0.2)' : 'rgba(255,92,25,0.15)', border: `1px solid ${form.receta.some(r => r.insumo_id === ins.id) ? 'rgba(16,185,129,0.4)' : 'rgba(255,92,25,0.3)'}`, color: form.receta.some(r => r.insumo_id === ins.id) ? '#10b981' : '#ff5c19' }}>
              {form.receta.some(r => r.insumo_id === ins.id) ? '✓' : '+'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Paso 4 ─── */
function Step4({ form, set }: { form: WizardForm; set: (f: Partial<WizardForm>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 8 }}>Estado de publicación</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {(['PUBLICADO', 'BORRADOR'] as const).map(e => (
            <button key={e} type="button" onClick={() => set({ estado_publicacion: e })}
              style={{ padding: '14px', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                background: form.estado_publicacion === e ? (e === 'PUBLICADO' ? 'rgba(16,185,129,0.2)' : 'rgba(107,114,128,0.2)') : 'rgba(255,255,255,0.04)',
                border: `2px solid ${form.estado_publicacion === e ? (e === 'PUBLICADO' ? '#10b981' : '#6b7280') : 'rgba(255,255,255,0.1)'}`,
                color: form.estado_publicacion === e ? (e === 'PUBLICADO' ? '#10b981' : '#9ca3af') : '#555' }}>
              {e === 'PUBLICADO' ? '🟢 Publicado' : '⚫ Borrador'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => set({ disponible: !form.disponible })}
          style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', background: form.disponible ? '#10b981' : '#374151', transition: 'background 0.2s' }}>
          <span style={{ position: 'absolute', top: 3, left: form.disponible ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
        </button>
        <span style={{ color: '#ddd', fontSize: 14 }}>Disponible para pedidos</span>
      </div>

      {/* Resumen */}
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>Resumen</div>
        {[
          ['Nombre', form.nombre],
          ['Precio', `Bs ${form.precio}`],
          ['Tipo', form.tipo],
          ['Ingredientes', form.tipo === 'ELABORADO' ? `${form.receta.length} insumos` : 'Insumo de reventa'],
          ['Marcas', `${form.marcas.length} seleccionadas`],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
            <span style={{ color: '#666' }}>{k}</span>
            <span style={{ color: '#ddd' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Wizard principal ─── */
export default function AdminProductWizard({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setFormState] = useState<WizardForm>(INIT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const qc = useQueryClient();

  const set = (partial: Partial<WizardForm>) => setFormState(prev => ({ ...prev, ...partial }));

  const canNext = () => {
    if (step === 0) return form.nombre.trim().length >= 2 && form.precio > 0;
    return true;
  };

  const submit = async () => {
    setLoading(true); setError('');
    try {
      await apiClient.post('/api/admin/productos', {
        nombre: form.nombre, descripcion: form.descripcion, precio: form.precio,
        calorias: form.calorias, proteina: form.proteina,
        tipo: form.tipo, estado_publicacion: form.estado_publicacion,
        disponible: form.disponible, categorias: form.categorias,
        marcas: form.marcas, receta: form.receta,
        insumo_reventa_id: form.insumo_reventa_id,
        imagen_url: null,
      });
      qc.invalidateQueries({ queryKey: ['admin', 'productos-recetas'] });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Error al crear producto');
    } finally { setLoading(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        style={{ background: '#12121f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 32, width: 'min(580px, 95vw)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 100px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>Nuevo Producto</h2>
            <p style={{ color: '#666', fontSize: 13, marginTop: 2 }}>Paso {step + 1} de {STEPS.length}: {STEPS[step]}</p>
          </div>
          <button onClick={onClose} style={{ color: '#555', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 4, background: i <= step ? '#ff5c19' : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
          ))}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} transition={{ duration: 0.2 }}>
            {step === 0 && <Step1 form={form} set={set} />}
            {step === 1 && <Step2 form={form} set={set} />}
            {step === 2 && <Step3 form={form} set={set} />}
            {step === 3 && <Step4 form={form} set={set} />}
          </motion.div>
        </AnimatePresence>

        {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 12 }}>{error}</p>}

        {/* Nav buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{ flex: 1, padding: 12, borderRadius: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#888', fontWeight: 600 }}>
              ← Anterior
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => setStep(s => s + 1)} disabled={!canNext()}
              style={{ flex: 2, padding: 12, borderRadius: 12, cursor: canNext() ? 'pointer' : 'not-allowed', background: 'linear-gradient(135deg,#ff5c19,#ff8c00)', border: 'none', color: '#fff', fontWeight: 700, opacity: canNext() ? 1 : 0.5 }}>
              Siguiente →
            </motion.button>
          ) : (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={submit} disabled={loading}
              style={{ flex: 2, padding: 12, borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', color: '#fff', fontWeight: 700 }}>
              {loading ? 'Guardando…' : '✓ Crear Producto'}
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

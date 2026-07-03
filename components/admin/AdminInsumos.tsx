'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '@/hooks/api';

type Tab = 'insumos' | 'movimientos' | 'recetas';
type EstadoStock = 'ok' | 'bajo' | 'critico' | 'agotado';
type ModalAction = 'crear' | 'editar' | 'compra' | 'merma' | 'conteo' | null;

interface Insumo {
  id: number;
  nombre: string;
  stock_actual: number;
  stock_minimo: number;
  punto_critico: number;
  unidad_medida: 'KG' | 'GR' | 'UNIDAD' | 'LT' | 'ML' | string;
  costo_promedio: number;
  es_mixto: boolean;
  uso_diario_promedio: number | null;
  categoria_insumo: string | null;
  proveedor: string | null;
}

interface Movimiento {
  id: number;
  tipo_movimiento: string;
  cantidad: number;
  descripcion: string;
  costo_unitario: number | null;
  responsable?: string | null;
  created_at: string;
  insumo: { nombre: string; unidad_medida: string };
}

interface Receta {
  id: number;
  producto_id: number;
  insumo_id: number;
  cantidad_utilizada: number;
  producto: { id: number; nombre: string; precio?: number };
  insumo: { id: number; nombre: string; unidad_medida: string; costo_promedio: number; stock_actual: number };
}

interface FormState {
  cantidad: string;
  categoria_insumo: string;
  costo_promedio: string;
  costo_unitario: string;
  descripcion: string;
  nuevo_stock: string;
  nombre: string;
  proveedor: string;
  punto_critico: string;
  stock_actual: string;
  stock_minimo: string;
  unidad_medida: string;
}

const EMPTY_FORM: FormState = {
  cantidad: '',
  categoria_insumo: '',
  costo_promedio: '',
  costo_unitario: '',
  descripcion: '',
  nuevo_stock: '',
  nombre: '',
  proveedor: '',
  punto_critico: '',
  stock_actual: '',
  stock_minimo: '',
  unidad_medida: 'KG',
};

const STOCK_META: Record<EstadoStock, { label: string; className: string; color: string }> = {
  ok: { label: 'OK', className: 'publicado', color: 'var(--fresh)' },
  bajo: { label: 'Bajo', className: 'borrador', color: 'var(--amber)' },
  critico: { label: 'Crítico', className: 'archivado', color: 'var(--danger)' },
  agotado: { label: 'Agotado', className: 'archivado', color: 'var(--danger)' },
};

const MOVEMENT_META: Record<string, { label: string; color: string }> = {
  INGRESO: { label: 'Ingreso', color: 'var(--fresh)' },
  EGRESO: { label: 'Egreso', color: 'var(--amber)' },
  PRODUCCION: { label: 'Producción', color: 'var(--info)' },
  VENTA: { label: 'Venta', color: 'var(--info)' },
  MERMA: { label: 'Merma', color: 'var(--danger)' },
  AJUSTE: { label: 'Ajuste', color: 'var(--kale)' },
};

const UNITS = ['KG', 'GR', 'UNIDAD', 'LT', 'ML'];

function stockState(insumo: Insumo): EstadoStock {
  if (insumo.stock_actual <= 0) return 'agotado';
  const critico = insumo.punto_critico > 0 ? insumo.punto_critico : insumo.stock_minimo;
  if (insumo.stock_actual <= critico) return 'critico';
  if (insumo.stock_actual <= insumo.stock_minimo) return 'bajo';
  return 'ok';
}

function money(value: number) {
  return `Bs ${Number(value || 0).toFixed(2)}`;
}

function number(value: number) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function coverage(insumo: Insumo) {
  if (!insumo.uso_diario_promedio || insumo.uso_diario_promedio <= 0) return '—';
  return `${Math.floor(insumo.stock_actual / insumo.uso_diario_promedio)} días`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function errorMsg(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
  if (e?.response?.status === 403) return 'No tienes permiso. Inicia sesión como administrador o dueño.';
  if (e?.response?.status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  return e?.response?.data?.error ?? e?.response?.data?.message ?? 'Ocurrió un error. Intenta de nuevo.';
}

export default function AdminInsumos() {
  const [tab, setTab] = useState<Tab>('insumos');
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | EstadoStock>('todos');
  const [selected, setSelected] = useState<Insumo | null>(null);
  const [modalAction, setModalAction] = useState<ModalAction>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [pageMsg, setPageMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [insumosRes, movimientosRes, recetasRes] = await Promise.all([
        apiClient.get('/api/insumo'),
        apiClient.get('/api/insumo/movimiento'),
        apiClient.get('/api/recetas'),
      ]);
      setInsumos(Array.isArray(insumosRes.data) ? insumosRes.data : []);
      setMovimientos(movimientosRes.data?.data ?? []);
      setRecetas(recetasRes.data?.data ?? []);
    } catch (err) {
      console.error(err);
      setInsumos([]);
      setMovimientos([]);
      setRecetas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    return insumos.reduce((acc, insumo) => {
      acc[stockState(insumo)] += 1;
      return acc;
    }, { ok: 0, bajo: 0, critico: 0, agotado: 0 } as Record<EstadoStock, number>);
  }, [insumos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return insumos
      .filter(insumo => statusFilter === 'todos' || stockState(insumo) === statusFilter)
      .filter(insumo => !q || insumo.nombre.toLowerCase().includes(q) || (insumo.categoria_insumo ?? '').toLowerCase().includes(q));
  }, [insumos, search, statusFilter]);

  const recipesByProduct = useMemo(() => {
    const groups = new Map<number, { producto: Receta['producto']; items: Receta[]; costo: number }>();
    for (const receta of recetas) {
      const group = groups.get(receta.producto_id) ?? { producto: receta.producto, items: [], costo: 0 };
      group.items.push(receta);
      group.costo += Number(receta.cantidad_utilizada || 0) * Number(receta.insumo?.costo_promedio || 0);
      groups.set(receta.producto_id, group);
    }
    return Array.from(groups.values()).sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre));
  }, [recetas]);

  const totalValue = insumos.reduce((sum, item) => sum + item.stock_actual * item.costo_promedio, 0);

  const openModal = (action: ModalAction, insumo?: Insumo) => {
    setFormError('');
    setModalAction(action);
    setSelected(insumo ?? null);
    if (action === 'editar' && insumo) {
      setForm({
        ...EMPTY_FORM,
        nombre: insumo.nombre,
        categoria_insumo: insumo.categoria_insumo ?? '',
        unidad_medida: insumo.unidad_medida,
        costo_promedio: String(insumo.costo_promedio),
        stock_minimo: String(insumo.stock_minimo),
        punto_critico: String(insumo.punto_critico),
        proveedor: insumo.proveedor ?? '',
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        nuevo_stock: insumo ? String(insumo.stock_actual) : '',
      });
    }
  };

  const closeModal = () => {
    setModalAction(null);
    setSelected(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const handleDelete = async (insumo: Insumo) => {
    if (!window.confirm(`¿Eliminar el insumo "${insumo.nombre}"? Esta acción no se puede deshacer.`)) return;
    setPageMsg(null);
    try {
      await apiClient.delete(`/api/insumo/${insumo.id}`);
      setPageMsg({ type: 'ok', text: `Insumo "${insumo.nombre}" eliminado.` });
      await load();
    } catch (err) {
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  const submitModal = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (modalAction === 'crear') {
        await apiClient.post('/api/insumo', {
          categoria_insumo: form.categoria_insumo.trim() || null,
          costo_promedio: Number(form.costo_promedio || 0),
          nombre: form.nombre.trim(),
          proveedor: form.proveedor.trim() || null,
          punto_critico: Number(form.punto_critico || 0),
          stock_actual: Number(form.stock_actual || 0),
          stock_minimo: Number(form.stock_minimo || 0),
          unidad_medida: form.unidad_medida,
        });
      }
      if (modalAction === 'editar' && selected) {
        await apiClient.put(`/api/insumo/${selected.id}`, {
          categoria_insumo: form.categoria_insumo.trim() || null,
          costo_promedio: Number(form.costo_promedio || 0),
          nombre: form.nombre.trim(),
          proveedor: form.proveedor.trim() || null,
          punto_critico: Number(form.punto_critico || 0),
          stock_actual: selected.stock_actual,
          stock_minimo: Number(form.stock_minimo || 0),
          unidad_medida: form.unidad_medida,
        });
      }
      if (modalAction === 'compra' && selected) {
        await apiClient.post('/api/admin/insumos/compra', {
          insumo_id: selected.id,
          cantidad: Number(form.cantidad || 0),
          costo_unitario: Number(form.costo_unitario || 0),
          nota: form.descripcion || undefined,
        });
      }
      if (modalAction === 'merma' && selected) {
        await apiClient.post('/api/admin/insumos/merma', {
          insumo_id: selected.id,
          cantidad: Number(form.cantidad || 0),
          descripcion: form.descripcion || `Merma de ${selected.nombre}`,
        });
      }
      if (modalAction === 'conteo' && selected) {
        await apiClient.post('/api/admin/insumos/conteo', {
          insumo_id: selected.id,
          nuevo_stock: Number(form.nuevo_stock || 0),
          descripcion: form.descripcion || undefined,
        });
      }
      closeModal();
      await load();
    } catch (err) {
      setFormError(errorMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const modalTitle = modalAction === 'crear'
    ? 'Nuevo insumo'
    : modalAction === 'editar'
      ? `Editar insumo · ${selected?.nombre ?? ''}`
      : modalAction === 'compra'
        ? `Registrar compra · ${selected?.nombre ?? ''}`
        : modalAction === 'merma'
          ? `Registrar merma · ${selected?.nombre ?? ''}`
          : `Conteo físico (corregir stock) · ${selected?.nombre ?? ''}`;

  return (
    <div className="admin-inventory">
      <div className="admin-page-header">
        <div>
          <h1>Inventario</h1>
          <p>Stock, movimientos y fichas técnicas</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="admin-btn secondary" onClick={load} type="button">Actualizar</button>
          <button className="admin-btn primary" onClick={() => openModal('crear')} type="button">+ Insumo</button>
        </div>
      </div>

      {pageMsg && (
        <div
          className="gate-warning"
          style={pageMsg.type === 'ok'
            ? { background: 'rgba(31,169,113,.12)', borderColor: 'rgba(31,169,113,.35)', color: 'var(--fresh)', marginBottom: 14 }
            : { marginBottom: 14 }}
          onClick={() => setPageMsg(null)}
        >
          {pageMsg.text}
        </div>
      )}

      <div className="inv-summary">
        <div className="inv-stat"><div className="inv-stat-label">Valor total</div><div className="inv-stat-val">{money(totalValue)}</div></div>
        <div className="inv-stat"><div className="inv-stat-label">Bajo umbral</div><div className="inv-stat-val" style={{ color: 'var(--amber)' }}>{counts.bajo}</div></div>
        <div className="inv-stat"><div className="inv-stat-label">Críticos</div><div className="inv-stat-val" style={{ color: 'var(--danger)' }}>{counts.critico + counts.agotado}</div></div>
        <div className="inv-stat"><div className="inv-stat-label">Insumos</div><div className="inv-stat-val">{insumos.length}</div></div>
      </div>

      <div className="inv-tabs">
        {[
          ['insumos', 'Insumos'],
          ['movimientos', 'Movimientos'],
          ['recetas', 'Recetas'],
        ].map(([key, label]) => (
          <button key={key} className={`inv-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key as Tab)} type="button">
            {label}
          </button>
        ))}
      </div>

      {tab === 'insumos' && (
        <>
          <div className="admin-filters">
            <div className="admin-search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar insumo..." />
            </div>
            <div className="admin-cat-filters">
              {[
                ['todos', 'Todos', insumos.length],
                ['ok', 'OK', counts.ok],
                ['bajo', 'Bajo', counts.bajo],
                ['critico', 'Crítico', counts.critico],
                ['agotado', 'Agotado', counts.agotado],
              ].map(([key, label, count]) => (
                <button
                  key={key}
                  className={`cat-filter-btn ${statusFilter === key ? 'active' : ''}`}
                  onClick={() => setStatusFilter(key as typeof statusFilter)}
                  type="button"
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="empty-state"><h4>Cargando inventario</h4><p>Consultando stock actual.</p></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <h4>Sin insumos</h4>
              <p>{insumos.length === 0 ? 'Crea el primer insumo para controlar el stock.' : 'Ajusta los filtros o la búsqueda.'}</p>
              {insumos.length === 0 && <button className="admin-btn primary" onClick={() => openModal('crear')} type="button">+ Insumo</button>}
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th>Categoría</th>
                    <th>Nivel</th>
                    <th className="num">Stock</th>
                    <th className="num">Reorden</th>
                    <th className="num">Cobertura</th>
                    <th className="num">Costo unit.</th>
                    <th className="num">Valor</th>
                    <th>Proveedor</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(insumo => {
                    const state = stockState(insumo);
                    const meta = STOCK_META[state];
                    const value = insumo.stock_actual * insumo.costo_promedio;
                    return (
                      <tr key={insumo.id}>
                        <td>
                          <div className="product-cell">
                            <span className="product-cell-name">
                              {insumo.nombre}
                              {insumo.es_mixto && <span className="cat-badge" style={{ marginLeft: 6 }}>Mixto</span>}
                            </span>
                            <span className="product-cell-desc">{insumo.unidad_medida}</span>
                          </div>
                        </td>
                        <td>{insumo.categoria_insumo || '—'}</td>
                        <td><span className={`pub-badge ${meta.className}`} style={{ color: meta.color }}>{meta.label}</span></td>
                        <td className="num"><span className={`stock-val ${state !== 'ok' ? 'low' : ''}`}>{number(insumo.stock_actual)} {insumo.unidad_medida}</span></td>
                        <td className="num">{number(insumo.stock_minimo)}</td>
                        <td className="num">{coverage(insumo)}</td>
                        <td className="num">{money(insumo.costo_promedio)}</td>
                        <td className="num">{money(value)}</td>
                        <td>{insumo.proveedor || '—'}</td>
                        <td>
                          <div className="action-btns">
                            <button className="action-btn edit" title="Editar insumo (nombre, costo, mínimos, proveedor)" onClick={() => openModal('editar', insumo)} type="button">✏</button>
                            <button className="action-btn edit" title="Compra" onClick={() => openModal('compra', insumo)} type="button">↥</button>
                            <button className="action-btn delete" title="Merma" onClick={() => openModal('merma', insumo)} type="button">⌫</button>
                            <button className="action-btn" title="Corregir stock (conteo físico) — usa esto si te equivocaste en una cantidad" onClick={() => openModal('conteo', insumo)} type="button">✓</button>
                            <button className="action-btn delete" title="Eliminar insumo" onClick={() => handleDelete(insumo)} type="button">🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'movimientos' && (
        movimientos.length === 0 ? (
          <div className="empty-state"><h4>Sin movimientos aún</h4><p>Las compras, ventas, mermas y ajustes aparecerán aquí.</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Insumo</th>
                  <th>Tipo</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Costo</th>
                  <th>Referencia</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map(mov => {
                  const meta = MOVEMENT_META[mov.tipo_movimiento] ?? { label: mov.tipo_movimiento, color: 'var(--slate)' };
                  return (
                    <tr key={mov.id}>
                      <td>{formatDate(mov.created_at)}</td>
                      <td>{mov.insumo?.nombre ?? '—'}</td>
                      <td><span className="cat-badge" style={{ color: meta.color }}>{meta.label}</span></td>
                      <td className="num">{number(mov.cantidad)} {mov.insumo?.unidad_medida}</td>
                      <td className="num">{mov.costo_unitario ? money(mov.costo_unitario) : '—'}</td>
                      <td>{mov.descripcion}</td>
                      <td>{mov.responsable || 'Sistema'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'recetas' && (
        recipesByProduct.length === 0 ? (
          <div className="empty-state"><h4>Sin recetas registradas</h4><p>Las fichas técnicas de productos aparecerán aquí cuando tengan insumos asociados.</p></div>
        ) : (
          <div className="dashboard-grid">
            {recipesByProduct.map(group => (
              <div key={group.producto.id} className="dash-card span-6">
                <div className="dash-card-header">
                  <h3>{group.producto.nombre}</h3>
                  <span className="dash-card-sub">{money(group.costo)} costo receta</span>
                </div>
                <div className="alert-card-list">
                  {group.items.map(item => (
                    <div key={item.id} className="alert-row">
                      <span className="alert-row-name">{item.insumo.nombre}</span>
                      <span className="alert-row-qty">{number(item.cantidad_utilizada)} {item.insumo.unidad_medida}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {modalAction && (
        <div className="admin-modal-overlay" onMouseDown={closeModal}>
          <form className="admin-modal" onSubmit={submitModal} onMouseDown={event => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{modalTitle}</h3>
              <button className="admin-modal-close" onClick={closeModal} type="button">×</button>
            </div>
            <div className="admin-modal-body">
              {modalAction === 'crear' ? (
                <div className="form-grid">
                  <label className="form-group full"><span>Nombre</span><input value={form.nombre} onChange={event => setForm(prev => ({ ...prev, nombre: event.target.value }))} required /></label>
                  <label className="form-group"><span>Categoría</span><input placeholder="Granos" value={form.categoria_insumo} onChange={event => setForm(prev => ({ ...prev, categoria_insumo: event.target.value }))} /></label>
                  <label className="form-group"><span>Unidad</span><select value={form.unidad_medida} onChange={event => setForm(prev => ({ ...prev, unidad_medida: event.target.value }))}>{UNITS.map(unit => <option key={unit} value={unit}>{unit.toLowerCase()}</option>)}</select></label>
                  <label className="form-group"><span>Stock</span><input type="number" min="0" step="0.01" value={form.stock_actual} onChange={event => setForm(prev => ({ ...prev, stock_actual: event.target.value }))} required /></label>
                  <label className="form-group"><span>Costo unitario (Bs)</span><input type="number" min="0" step="0.01" value={form.costo_promedio} onChange={event => setForm(prev => ({ ...prev, costo_promedio: event.target.value }))} /></label>
                  <label className="form-group"><span>Stock mínimo</span><input type="number" min="0" step="0.01" value={form.stock_minimo} onChange={event => setForm(prev => ({ ...prev, stock_minimo: event.target.value }))} required /></label>
                  <label className="form-group"><span>Stock crítico</span><input type="number" min="0" step="0.01" value={form.punto_critico} onChange={event => setForm(prev => ({ ...prev, punto_critico: event.target.value }))} /></label>
                  <label className="form-group full"><span>Proveedor</span><input value={form.proveedor} onChange={event => setForm(prev => ({ ...prev, proveedor: event.target.value }))} /></label>
                </div>
              ) : modalAction === 'editar' ? (
                <div className="form-grid">
                  <label className="form-group full"><span>Nombre</span><input value={form.nombre} onChange={event => setForm(prev => ({ ...prev, nombre: event.target.value }))} required /></label>
                  <label className="form-group"><span>Categoría</span><input placeholder="Granos" value={form.categoria_insumo} onChange={event => setForm(prev => ({ ...prev, categoria_insumo: event.target.value }))} /></label>
                  <label className="form-group"><span>Unidad</span><select value={form.unidad_medida} onChange={event => setForm(prev => ({ ...prev, unidad_medida: event.target.value }))}>{UNITS.map(unit => <option key={unit} value={unit}>{unit.toLowerCase()}</option>)}</select></label>
                  <label className="form-group"><span>Costo unitario (Bs)</span><input type="number" min="0" step="0.01" value={form.costo_promedio} onChange={event => setForm(prev => ({ ...prev, costo_promedio: event.target.value }))} /></label>
                  <label className="form-group"><span>Stock mínimo</span><input type="number" min="0" step="0.01" value={form.stock_minimo} onChange={event => setForm(prev => ({ ...prev, stock_minimo: event.target.value }))} required /></label>
                  <label className="form-group"><span>Stock crítico</span><input type="number" min="0" step="0.01" value={form.punto_critico} onChange={event => setForm(prev => ({ ...prev, punto_critico: event.target.value }))} /></label>
                  <label className="form-group full"><span>Proveedor</span><input value={form.proveedor} onChange={event => setForm(prev => ({ ...prev, proveedor: event.target.value }))} /></label>
                  <div className="form-group full">
                    <span className="form-hint">
                      Este formulario no cambia la cantidad en stock. Para corregir una cantidad mal registrada, usa el botón ✓ "Corregir stock" en la fila del insumo.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="form-grid">
                  {modalAction === 'conteo' ? (
                    <>
                      <label className="form-group"><span>Stock real</span><input type="number" min="0" step="0.01" value={form.nuevo_stock} onChange={event => setForm(prev => ({ ...prev, nuevo_stock: event.target.value }))} required /></label>
                      <div className="form-group full">
                        <span className="form-hint">
                          Escribe la cantidad correcta (no lo que hay que sumar/restar). El sistema calcula la diferencia contra el stock actual ({selected ? number(selected.stock_actual) : 0} {selected?.unidad_medida}) y la deja registrada como ajuste en el historial de movimientos.
                        </span>
                      </div>
                    </>
                  ) : (
                    <label className="form-group"><span>Cantidad</span><input type="number" min="0" step="0.01" value={form.cantidad} onChange={event => setForm(prev => ({ ...prev, cantidad: event.target.value }))} required /></label>
                  )}
                  {modalAction === 'compra' && (
                    <label className="form-group"><span>Costo unitario</span><input type="number" min="0" step="0.01" value={form.costo_unitario} onChange={event => setForm(prev => ({ ...prev, costo_unitario: event.target.value }))} required /></label>
                  )}
                  <label className="form-group full"><span>Nota</span><textarea rows={3} value={form.descripcion} onChange={event => setForm(prev => ({ ...prev, descripcion: event.target.value }))} /></label>
                </div>
              )}
              {formError && <div className="gate-warning" style={{ marginTop: 12 }}>{formError}</div>}
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn secondary" onClick={closeModal} type="button">Cancelar</button>
              <button className="admin-btn primary" disabled={saving} type="submit">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

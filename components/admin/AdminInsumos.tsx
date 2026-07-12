'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '@/hooks/api';
import { useDarDeBajaInsumo, useReactivarInsumo, type ResultadoBajaInsumo, type ResultadoReactivarInsumo } from '@/hooks/insumos';

type Tab = 'insumos' | 'movimientos' | 'recetas' | 'unidades';
type EstadoStock = 'ok' | 'bajo' | 'critico' | 'agotado';
type ModalAction = 'crear' | 'editar' | 'compra' | 'merma' | 'conteo' | 'baja' | null;

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
  equivalencia_unidad: string | null;
  equivalencia_cantidad: number | null;
  activo: boolean;
  fecha_baja: string | null;
  motivo_baja: string | null;
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
  equivalencia_cantidad: string;
  equivalencia_unidad: string;
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
  equivalencia_cantidad: '',
  equivalencia_unidad: '',
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
  BAJA: { label: 'Baja', color: 'var(--danger)' },
};

interface UnidadMedidaRow {
  id: number;
  nombre: string;
  activo: boolean;
}

const UNIDADES_MEDIDA = ['ML', 'LT', 'GR', 'KG'];

const UNIDAD_LABELS: Record<string, { label: string; sufijo: string }> = {
  ML: { label: 'mililitros', sufijo: 'ml' },
  LT: { label: 'litros', sufijo: 'L' },
  GR: { label: 'gramos', sufijo: 'g' },
  KG: { label: 'kilogramos', sufijo: 'kg' },
  UNIDAD: { label: 'unidades', sufijo: 'u.' },
};

function medidaInfo(u: string) {
  return UNIDAD_LABELS[u.toUpperCase()] ?? { label: u.toLowerCase(), sufijo: u.toLowerCase() };
}

function UnidadFieldGroup({
  unidadMedida,
  unidadesParaSelect,
  equivalenciaUnidad,
  equivalenciaCantidad,
  onUnidadChange,
  onEquivalenciaUnidadChange,
  onEquivalenciaCantidadChange,
  onNuevaUnidad,
}: {
  unidadMedida: string;
  unidadesParaSelect: UnidadMedidaRow[];
  equivalenciaUnidad: string;
  equivalenciaCantidad: string;
  onUnidadChange: (value: string) => void;
  onEquivalenciaUnidadChange: (value: string) => void;
  onEquivalenciaCantidadChange: (value: string) => void;
  onNuevaUnidad: () => void;
}) {
  const mostrarPanel = unidadMedida.trim() !== '';
  const info = equivalenciaUnidad ? medidaInfo(equivalenciaUnidad) : null;

  return (
    <label className="form-group">
      <span>Unidad</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={unidadMedida} onChange={event => onUnidadChange(event.target.value)} style={{ flex: 1 }}>
          {unidadesParaSelect.map(unidad => <option key={unidad.id} value={unidad.nombre}>{unidad.nombre}</option>)}
        </select>
        <button className="admin-btn secondary" onClick={onNuevaUnidad} type="button">+ Nueva</button>
      </div>
      {mostrarPanel && (
        <div className="unidad-contenido-panel">
          <span className="form-hint">Contenido por unidad (opcional)</span>
          <div className="form-grid">
            <div className="form-group">
              <span>Unidad de medida</span>
              <select value={equivalenciaUnidad} onChange={event => onEquivalenciaUnidadChange(event.target.value)}>
                <option value="">—</option>
                {UNIDADES_MEDIDA.map(u => <option key={u} value={u}>{medidaInfo(u).label}</option>)}
              </select>
            </div>
            {equivalenciaUnidad && info && (
              <div className="form-group">
                <span>Cantidad ({info.label})</span>
                <div className="input-suffix">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={equivalenciaCantidad}
                    onChange={event => onEquivalenciaCantidadChange(event.target.value)}
                  />
                  <span>{info.sufijo}</span>
                </div>
              </div>
            )}
          </div>
          {equivalenciaUnidad && equivalenciaCantidad && info && (
            <span className="form-hint">
              Ej.: 1 {unidadMedida} de este insumo = {equivalenciaCantidad} {info.sufijo}. No afecta stock ni recetas.
            </span>
          )}
        </div>
      )}
    </label>
  );
}

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
  const [unidades, setUnidades] = useState<UnidadMedidaRow[]>([]);
  const [unidadModal, setUnidadModal] = useState<'crear' | 'editar' | null>(null);
  const [selectedUnidad, setSelectedUnidad] = useState<UnidadMedidaRow | null>(null);
  const [unidadForm, setUnidadForm] = useState<{ nombre: string; activo: boolean }>({ nombre: '', activo: true });
  const [unidadSaving, setUnidadSaving] = useState(false);
  const [unidadError, setUnidadError] = useState('');
  const [selectedCategorias, setSelectedCategorias] = useState<string[]>([]);
  const [categoriaMenuOpen, setCategoriaMenuOpen] = useState(false);
  const [resultadoBaja, setResultadoBaja] = useState<ResultadoBajaInsumo | null>(null);
  const [resultadoReactivar, setResultadoReactivar] = useState<ResultadoReactivarInsumo | null>(null);
  const [vistaInsumos, setVistaInsumos] = useState<'activos' | 'baja'>('activos');
  const darDeBaja = useDarDeBajaInsumo();
  const reactivar = useReactivarInsumo();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [insumosRes, movimientosRes, recetasRes, unidadesRes] = await Promise.all([
        apiClient.get('/api/insumo?incluir_inactivos=1'),
        apiClient.get('/api/insumo/movimiento'),
        apiClient.get('/api/recetas'),
        apiClient.get('/api/unidades-medida'),
      ]);
      setInsumos(Array.isArray(insumosRes.data) ? insumosRes.data : []);
      setMovimientos(movimientosRes.data?.data ?? []);
      setRecetas(recetasRes.data?.data ?? []);
      setUnidades(Array.isArray(unidadesRes.data) ? unidadesRes.data : []);
    } catch (err) {
      console.error(err);
      setInsumos([]);
      setMovimientos([]);
      setRecetas([]);
      setUnidades([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const insumosActivos = useMemo(() => insumos.filter(i => i.activo), [insumos]);
  // Base de la vista actual: activos o dados de baja (los filtros de stock cuentan sobre esta)
  const insumosVista = useMemo(
    () => (vistaInsumos === 'baja' ? insumos.filter(i => !i.activo) : insumosActivos),
    [vistaInsumos, insumos, insumosActivos],
  );

  // KPIs de cabecera: siempre sobre activos (los de baja no son inventario operativo)
  const counts = useMemo(() => {
    return insumosActivos.reduce((acc, insumo) => {
      acc[stockState(insumo)] += 1;
      return acc;
    }, { ok: 0, bajo: 0, critico: 0, agotado: 0 } as Record<EstadoStock, number>);
  }, [insumosActivos]);

  const countsVista = useMemo(() => {
    return insumosVista.reduce((acc, insumo) => {
      acc[stockState(insumo)] += 1;
      return acc;
    }, { ok: 0, bajo: 0, critico: 0, agotado: 0 } as Record<EstadoStock, number>);
  }, [insumosVista]);

  const categoriasDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const insumo of insumos) {
      const cat = insumo.categoria_insumo?.trim();
      if (cat) set.add(cat);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [insumos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return insumosVista
      .filter(insumo => statusFilter === 'todos' || stockState(insumo) === statusFilter)
      .filter(insumo => !q || insumo.nombre.toLowerCase().includes(q) || (insumo.categoria_insumo ?? '').toLowerCase().includes(q))
      .filter(insumo => selectedCategorias.length === 0 || selectedCategorias.includes(insumo.categoria_insumo ?? ''));
  }, [insumosVista, search, statusFilter, selectedCategorias]);

  const toggleCategoria = (categoria: string) => {
    setSelectedCategorias(prev => prev.includes(categoria) ? prev.filter(c => c !== categoria) : [...prev, categoria]);
  };

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

  const unidadesActivas = useMemo(() => unidades.filter(u => u.activo), [unidades]);

  const unidadesParaSelect = useMemo(() => {
    if (!form.unidad_medida || unidadesActivas.some(u => u.nombre === form.unidad_medida)) {
      return unidadesActivas;
    }
    return [...unidadesActivas, { id: -1, nombre: form.unidad_medida, activo: false }];
  }, [unidadesActivas, form.unidad_medida]);

  const openUnidadModal = (action: 'crear' | 'editar', unidad?: UnidadMedidaRow) => {
    setUnidadError('');
    setUnidadModal(action);
    setSelectedUnidad(unidad ?? null);
    setUnidadForm(action === 'editar' && unidad
      ? { nombre: unidad.nombre, activo: unidad.activo }
      : { nombre: '', activo: true });
  };

  const closeUnidadModal = () => {
    setUnidadModal(null);
    setSelectedUnidad(null);
    setUnidadForm({ nombre: '', activo: true });
    setUnidadError('');
  };

  const submitUnidad = async (event: FormEvent) => {
    event.preventDefault();
    setUnidadSaving(true);
    setUnidadError('');
    try {
      const nombreTrim = unidadForm.nombre.trim();
      let saved: UnidadMedidaRow;
      if (unidadModal === 'crear') {
        const res = await apiClient.post('/api/unidades-medida', { nombre: nombreTrim });
        saved = res.data;
      } else {
        const res = await apiClient.put(`/api/unidades-medida/${selectedUnidad!.id}`, {
          nombre: nombreTrim,
          activo: unidadForm.activo,
        });
        saved = res.data;
      }
      const quickAddDesdeInsumo = unidadModal === 'crear' && modalAction !== null;
      closeUnidadModal();
      await load();
      if (quickAddDesdeInsumo) {
        setForm(prev => ({ ...prev, unidad_medida: saved.nombre }));
      }
    } catch (err) {
      setUnidadError(errorMsg(err));
    } finally {
      setUnidadSaving(false);
    }
  };

  const handleToggleUnidad = async (unidad: UnidadMedidaRow) => {
    setPageMsg(null);
    try {
      await apiClient.put(`/api/unidades-medida/${unidad.id}`, { activo: !unidad.activo });
      await load();
    } catch (err) {
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  const handleDeleteUnidad = async (unidad: UnidadMedidaRow) => {
    if (!window.confirm(`¿Eliminar la unidad "${unidad.nombre}"?`)) return;
    setPageMsg(null);
    try {
      await apiClient.delete(`/api/unidades-medida/${unidad.id}`);
      setPageMsg({ type: 'ok', text: `Unidad "${unidad.nombre}" eliminada.` });
      await load();
    } catch (err) {
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  const totalValue = insumosActivos.reduce((sum, item) => sum + item.stock_actual * item.costo_promedio, 0);

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
        equivalencia_unidad: insumo.equivalencia_unidad ?? '',
        equivalencia_cantidad: insumo.equivalencia_cantidad != null ? String(insumo.equivalencia_cantidad) : '',
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
    setResultadoBaja(null);
    setResultadoReactivar(null);
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

  const handleReactivar = async (insumo: Insumo) => {
    if (!window.confirm(`¿Reactivar el insumo "${insumo.nombre}"? Los productos en revisión se resolverán automáticamente.`)) return;
    setPageMsg(null);
    try {
      const resultado = await reactivar.mutateAsync(insumo.id);
      setResultadoReactivar(resultado);
      setPageMsg({
        type: 'ok',
        text: `Insumo "${resultado.insumo.nombre}" reactivado. ${resultado.productosResueltos} producto(s) resuelto(s).`,
      });
      await load();
    } catch (err) {
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  const submitModal = async (event: FormEvent) => {
    event.preventDefault();
    if (modalAction === 'crear' || modalAction === 'editar') {
      const tieneUnidad = form.equivalencia_unidad.trim() !== '';
      const tieneCantidad = form.equivalencia_cantidad.trim() !== '';
      if (tieneUnidad !== tieneCantidad) {
        setFormError('Completa la unidad y la cantidad de la equivalencia, o deja ambas vacías.');
        return;
      }
    }
    setSaving(true);
    setFormError('');
    try {
      if (modalAction === 'crear') {
        await apiClient.post('/api/insumo', {
          categoria_insumo: form.categoria_insumo.trim() || null,
          costo_promedio: Number(form.costo_promedio || 0),
          equivalencia_unidad: form.equivalencia_unidad.trim() || null,
          equivalencia_cantidad: form.equivalencia_cantidad.trim() ? Number(form.equivalencia_cantidad) : null,
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
          equivalencia_unidad: form.equivalencia_unidad.trim() || null,
          equivalencia_cantidad: form.equivalencia_cantidad.trim() ? Number(form.equivalencia_cantidad) : null,
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
      if (modalAction === 'baja' && selected) {
        const resultado = await darDeBaja.mutateAsync({
          id: selected.id,
          motivo: form.descripcion.trim() || `Baja de ${selected.nombre}`,
        });
        setResultadoBaja(resultado);
        setPageMsg({
          type: 'ok',
          text: `Insumo "${resultado.insumo.nombre}" dado de baja. ${resultado.productosEnRevision} producto(s) pasó/pasaron a revisión.`,
        });
        await load(); // Refresca la tabla detrás del modal de resultado
        return; // No cierra el modal aún, muestra resultado
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
          : modalAction === 'baja'
            ? `Dar de baja · ${selected?.nombre ?? ''}`
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
        <div className="inv-stat"><div className="inv-stat-label">Insumos</div><div className="inv-stat-val">{insumosActivos.length}</div></div>
      </div>

      <div className="inv-tabs">
        {[
          ['insumos', 'Insumos'],
          ['movimientos', 'Movimientos'],
          ['recetas', 'Recetas'],
          ['unidades', 'Unidades'],
        ].map(([key, label]) => (
          <button key={key} className={`inv-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key as Tab)} type="button">
            {label}
          </button>
        ))}
      </div>

      {tab === 'insumos' && (
        <>
          <div className="admin-cat-filters" style={{ marginBottom: 16 }}>
            <button
              className={`cat-filter-btn ${vistaInsumos === 'activos' ? 'active' : ''}`}
              onClick={() => { setVistaInsumos('activos'); setStatusFilter('todos'); }}
              type="button"
            >
              Activos ({insumos.filter(i => i.activo).length})
            </button>
            <button
              className={`cat-filter-btn ${vistaInsumos === 'baja' ? 'active' : ''}`}
              onClick={() => { setVistaInsumos('baja'); setStatusFilter('todos'); }}
              type="button"
              style={vistaInsumos === 'baja' ? { borderColor: 'var(--danger)' } : undefined}
            >
              ⛔ De Baja ({insumos.filter(i => !i.activo).length})
            </button>
          </div>
          <div className="admin-filters">
            <div className="admin-search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar insumo..." />
            </div>
            <div style={{ position: 'relative' }}>
              <button className="admin-btn secondary" onClick={() => setCategoriaMenuOpen(prev => !prev)} type="button" disabled={categoriasDisponibles.length === 0}>
                Categorías{selectedCategorias.length > 0 ? ` (${selectedCategorias.length})` : ''}
                <span style={{ marginLeft: 6 }}>{categoriaMenuOpen ? '▲' : '▼'}</span>
              </button>
              {categoriaMenuOpen && (
                <div
                  style={{
                    position: 'absolute', top: '110%', left: 0, zIndex: 20, minWidth: 220,
                    background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
                    boxShadow: 'var(--shadow-md)', padding: 12,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {categoriasDisponibles.map(categoria => (
                      <label key={categoria} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={selectedCategorias.includes(categoria)} onChange={() => toggleCategoria(categoria)} />
                        <span>{categoria}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    className="admin-btn ghost"
                    style={{ marginTop: 10, width: '100%' }}
                    onClick={() => setSelectedCategorias([])}
                    type="button"
                  >
                    Limpiar selección
                  </button>
                </div>
              )}
            </div>
            <div className="admin-cat-filters">
              {[
                ['todos', 'Todos', insumosVista.length],
                ['ok', 'OK', countsVista.ok],
                ['bajo', 'Bajo', countsVista.bajo],
                ['critico', 'Crítico', countsVista.critico],
                ['agotado', 'Agotado', countsVista.agotado],
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
                    <th>Equivalencia</th>
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
                              {!insumo.activo && <span className="cat-badge" style={{ marginLeft: 6, background: 'var(--danger)', color: 'white' }}>INACTIVO</span>}
                            </span>
                            <span className="product-cell-desc">{insumo.unidad_medida}</span>
                            {!insumo.activo && insumo.fecha_baja && (
                              <span className="product-cell-desc" style={{ color: 'var(--danger)', marginTop: 4 }}>
                                Baja: {new Date(insumo.fecha_baja).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{insumo.categoria_insumo || '—'}</td>
                        <td>{insumo.equivalencia_cantidad != null && insumo.equivalencia_unidad ? `${number(insumo.equivalencia_cantidad)} ${insumo.equivalencia_unidad}` : '—'}</td>
                        <td><span className={`pub-badge ${meta.className}`} style={{ color: meta.color }}>{meta.label}</span></td>
                        <td className="num"><span className={`stock-val ${state !== 'ok' ? 'low' : ''}`}>{number(insumo.stock_actual)} {insumo.unidad_medida}</span></td>
                        <td className="num">{number(insumo.stock_minimo)}</td>
                        <td className="num">{coverage(insumo)}</td>
                        <td className="num">{money(insumo.costo_promedio)}</td>
                        <td className="num">{money(value)}</td>
                        <td>{insumo.proveedor || '—'}</td>
                        <td>
                          <div className="action-btns">
                            {insumo.activo ? (
                              <>
                                <button className="action-btn edit" title="Editar insumo (nombre, costo, mínimos, proveedor)" onClick={() => openModal('editar', insumo)} type="button">✏</button>
                                <button className="action-btn edit" title="Compra" onClick={() => openModal('compra', insumo)} type="button">↥</button>
                                <button className="action-btn delete" title="Merma" onClick={() => openModal('merma', insumo)} type="button">⌫</button>
                                <button className="action-btn" title="Corregir stock (conteo físico) — usa esto si te equivocaste en una cantidad" onClick={() => openModal('conteo', insumo)} type="button">✓</button>
                                <button className="action-btn delete" title="Dar de baja" onClick={() => openModal('baja', insumo)} type="button">⛔</button>
                                <button className="action-btn delete" title="Eliminar insumo" onClick={() => handleDelete(insumo)} type="button">🗑</button>
                              </>
                            ) : (
                              <>
                                <button className="action-btn edit" title="Reactivar insumo" onClick={() => handleReactivar(insumo)} type="button">↩</button>
                              </>
                            )}
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

      {tab === 'unidades' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="admin-btn primary" onClick={() => openUnidadModal('crear')} type="button">+ Nueva unidad</button>
          </div>
          {unidades.length === 0 ? (
            <div className="empty-state"><h4>Sin unidades registradas</h4><p>Crea la primera unidad de medida para usarla en los insumos.</p></div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {unidades.map(unidad => (
                    <tr key={unidad.id}>
                      <td>{unidad.nombre}</td>
                      <td>
                        <span className={`pub-badge ${unidad.activo ? 'publicado' : 'archivado'}`} style={{ color: unidad.activo ? 'var(--fresh)' : 'var(--danger)' }}>
                          {unidad.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="action-btn edit" title="Editar" onClick={() => openUnidadModal('editar', unidad)} type="button">✏</button>
                          <button className="action-btn" title={unidad.activo ? 'Desactivar' : 'Activar'} onClick={() => handleToggleUnidad(unidad)} type="button">{unidad.activo ? '⏸' : '▶'}</button>
                          <button className="action-btn delete" title="Eliminar" onClick={() => handleDeleteUnidad(unidad)} type="button">🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
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
                  <UnidadFieldGroup
                    unidadMedida={form.unidad_medida}
                    unidadesParaSelect={unidadesParaSelect}
                    equivalenciaUnidad={form.equivalencia_unidad}
                    equivalenciaCantidad={form.equivalencia_cantidad}
                    onUnidadChange={value => setForm(prev => ({ ...prev, unidad_medida: value }))}
                    onEquivalenciaUnidadChange={value => setForm(prev => ({ ...prev, equivalencia_unidad: value }))}
                    onEquivalenciaCantidadChange={value => setForm(prev => ({ ...prev, equivalencia_cantidad: value }))}
                    onNuevaUnidad={() => openUnidadModal('crear')}
                  />
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
                  <UnidadFieldGroup
                    unidadMedida={form.unidad_medida}
                    unidadesParaSelect={unidadesParaSelect}
                    equivalenciaUnidad={form.equivalencia_unidad}
                    equivalenciaCantidad={form.equivalencia_cantidad}
                    onUnidadChange={value => setForm(prev => ({ ...prev, unidad_medida: value }))}
                    onEquivalenciaUnidadChange={value => setForm(prev => ({ ...prev, equivalencia_unidad: value }))}
                    onEquivalenciaCantidadChange={value => setForm(prev => ({ ...prev, equivalencia_cantidad: value }))}
                    onNuevaUnidad={() => openUnidadModal('crear')}
                  />
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
              ) : modalAction === 'baja' ? (
                resultadoBaja ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="gate-warning" style={{ background: 'rgba(31,169,113,.12)', borderColor: 'rgba(31,169,113,.35)', color: 'var(--fresh)' }}>
                      ✅ Insumo "{resultadoBaja.insumo.nombre}" dado de baja correctamente.
                    </div>
                    {resultadoBaja.productosEnRevision > 0 && (
                      <>
                        <div>
                          <strong style={{ color: 'var(--amber)' }}>⚠️ {resultadoBaja.productosEnRevision} producto(s) requiere(n) revisión:</strong>
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                            {resultadoBaja.productos.map(p => (
                              <div key={p.id} style={{ padding: '8px 10px', background: 'var(--surface-soft)', borderRadius: 'var(--radius)', borderLeft: '3px solid var(--amber)' }}>
                                <strong>{p.nombre}</strong>
                              </div>
                            ))}
                          </div>
                          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--slate)' }}>
                            Estos productos están en estado "EN REVISIÓN". Ve a la sección "Productos en Revisión" en el admin para editarlos o darlos de baja.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="form-grid">
                    <label className="form-group full"><span>Motivo de la baja</span><textarea rows={3} value={form.descripcion} onChange={event => setForm(prev => ({ ...prev, descripcion: event.target.value }))} placeholder="Ej: Proveedor descontinuó, Cambio de receta, etc." required /></label>
                    <div className="form-group full">
                      <span className="form-hint">
                        Si este insumo está en recetas de productos, esos productos pasarán a estado "EN REVISIÓN" para que los edites o los des de baja.
                      </span>
                    </div>
                  </div>
                )
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
              {modalAction === 'baja' && resultadoBaja ? (
                <button className="admin-btn primary" onClick={closeModal} type="button">Cerrar</button>
              ) : (
                <>
                  <button className="admin-btn secondary" onClick={closeModal} type="button">Cancelar</button>
                  <button className="admin-btn primary" disabled={saving || darDeBaja.isPending} type="submit">{saving || darDeBaja.isPending ? 'Guardando...' : 'Guardar'}</button>
                </>
              )}
            </div>
          </form>
        </div>
      )}

      {unidadModal && (
        <div className="admin-modal-overlay" style={{ zIndex: 110 }} onMouseDown={closeUnidadModal}>
          <form className="admin-modal compact" onSubmit={submitUnidad} onMouseDown={event => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{unidadModal === 'crear' ? 'Nueva unidad' : `Editar unidad · ${selectedUnidad?.nombre ?? ''}`}</h3>
              <button className="admin-modal-close" onClick={closeUnidadModal} type="button">×</button>
            </div>
            <div className="admin-modal-body">
              <div className="form-grid">
                <label className="form-group full">
                  <span>Nombre</span>
                  <input
                    value={unidadForm.nombre}
                    onChange={event => setUnidadForm(prev => ({ ...prev, nombre: event.target.value }))}
                    placeholder="Ej. paquete, caja, sobre"
                    required
                  />
                </label>
                {unidadModal === 'editar' && (
                  <label className="form-group full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={unidadForm.activo}
                      onChange={event => setUnidadForm(prev => ({ ...prev, activo: event.target.checked }))}
                    />
                    <span>Activa (disponible para nuevos insumos)</span>
                  </label>
                )}
              </div>
              {unidadError && <div className="gate-warning" style={{ marginTop: 12 }}>{unidadError}</div>}
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn secondary" onClick={closeUnidadModal} type="button">Cancelar</button>
              <button className="admin-btn primary" disabled={unidadSaving} type="submit">{unidadSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

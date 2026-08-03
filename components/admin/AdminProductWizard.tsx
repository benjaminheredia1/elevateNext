'use client';

import { useEffect, useMemo, useState } from 'react';
import apiClient from '@/hooks/api';
import {
  foodCostColor, classifyMenu, menuClassMeta, buildablePortions, computeRecipeCost, foodCostPct,
} from './inventoryData';
import { convertir, unidadesEntrada, redondearCantidad } from '@/lib/unidades';

export interface WizardInitial {
  id?: number;
  nombre: string;
  descripcion: string;
  precio: number;
  calorias: number | null;
  proteina: string | null;
  tipo: 'ELABORADO' | 'REVENTA';
  estado_publicacion: 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO';
  imagen_url: string | null;
  categorias: number[];
  marcas: number[];
  // ui_txt / ui_unidad son estado de edición (texto crudo y unidad tecleada);
  // cantidad_utilizada SIEMPRE está en la unidad base del insumo y es lo único que se guarda.
  receta: { insumo_id: number; cantidad_utilizada: number; ui_txt?: string; ui_unidad?: string }[];
  insumo_reventa_id: number | null;
  /**
   * Qué campos toma esta sucursal del catálogo. Editar uno lo vuelve propio del
   * local; "usar el del catálogo" lo devuelve a heredar. Vacío cuando se edita
   * el catálogo (vista consolidada del dueño), donde no hay de quién heredar.
   */
  heredado?: Partial<Record<CampoHeredable, boolean>>;
}

/** Campos que una sucursal puede heredar del catálogo o tener propios. */
export type CampoHeredable =
  | 'nombre' | 'descripcion' | 'imagen_url' | 'calorias' | 'proteina'
  | 'estado_publicacion' | 'categorias' | 'marcas';

interface InsumoOpt { id: number; nombre: string; unidad_medida: string; costo_promedio: number; stock_actual: number; stock_minimo?: number; punto_critico?: number; proveedor?: string | null; activo: boolean; }
interface CategoriaOpt { id: number; nombre: string; }
interface MarcaOpt { id: number; nombre: string; key?: string; color?: string; }

type UnidadMedida = 'KG' | 'GR' | 'UNIDAD' | 'LT' | 'ML';
const UNIDADES: UnidadMedida[] = ['UNIDAD', 'KG', 'GR', 'LT', 'ML'];
interface ReventaInsumo {
  unidad_medida: UnidadMedida;
  stock: number;
  costo_unitario: number;
  punto_reorden: number;
  nivel_critico: number;
  proveedor: string;
}
const EMPTY_REVENTA: ReventaInsumo = { unidad_medida: 'UNIDAD', stock: 0, costo_unitario: 0, punto_reorden: 0, nivel_critico: 0, proveedor: '' };

/** Combobox de insumo con búsqueda por nombre (el catálogo puede tener cientos). */
function InsumoPicker({ opciones, seleccionado, esDeBaja, onPick }: {
  opciones: InsumoOpt[];
  seleccionado: InsumoOpt | undefined;
  esDeBaja: boolean;
  onPick: (id: number) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return opciones;
    return opciones.filter(i => i.nombre.toLowerCase().includes(term));
  }, [opciones, q]);

  const etiqueta = seleccionado
    ? `${esDeBaja ? '⛔ ' : ''}${seleccionado.nombre} (${seleccionado.unidad_medida})${esDeBaja ? ' — dado de baja' : ''}`
    : 'Buscar insumo...';

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        value={abierto ? q : etiqueta}
        placeholder="Buscar insumo..."
        onFocus={() => { setAbierto(true); setQ(''); }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={e => setQ(e.target.value)}
        style={{ width: '100%', ...(esDeBaja && !abierto ? { color: 'var(--danger)', fontWeight: 600 } : {}) }}
      />
      {abierto && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
          background: 'var(--card, #fff)', border: '1px solid var(--line)', borderRadius: 8,
          maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)',
        }}>
          {filtrados.length === 0 && (
            <div className="dim" style={{ padding: '8px 10px', fontSize: '0.85rem' }}>Sin resultados para “{q}”</div>
          )}
          {filtrados.map(i => (
            <div
              key={i.id}
              onMouseDown={() => { onPick(i.id); setAbierto(false); }}
              style={{ padding: '7px 10px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas, #f5f5f5)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.nombre}</span>
              <span className="dim" style={{ fontSize: '0.78rem', flexShrink: 0 }}>{i.unidad_medida}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Dice si el campo viene del catálogo o es propio de esta sucursal, y deja
 * cambiarlo. Sin esto el usuario no puede saber si al guardar está congelando
 * un valor o si el campo va a seguir los cambios que haga el dueño.
 */
function Herencia({ heredado, onVolverAHeredar }: { heredado: boolean; onVolverAHeredar: () => void }) {
  if (heredado) {
    return (
      <span className="form-hint" title="Si el dueño lo cambia en el catálogo, acá también cambia">
        ↳ heredado del catálogo
      </span>
    );
  }
  return (
    <span className="form-hint">
      ★ propio de esta sucursal{' '}
      <button
        type="button"
        className="linklike"
        onClick={onVolverAHeredar}
        title="Vuelve a tomar el valor del catálogo y a seguir sus cambios"
      >
        usar el del catálogo
      </button>
    </span>
  );
}

export default function AdminProductWizard({ initial, avgSales, avgMargin, sucursalId, sucursalNombre, onClose, onSaved }: {
  initial: WizardInitial;
  avgSales: number;
  avgMargin: number;
  /** Local del alta: su precio, su receta y su stock inicial. Sin esto el
   *  producto nacía siempre en la sucursal principal, aunque estuvieras
   *  parado en otra. */
  sucursalId?: number;
  /** Solo para avisar en pantalla a qué local afecta lo que se está editando. */
  sucursalNombre?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<WizardInitial>(initial);
  const [insumos, setInsumos] = useState<InsumoOpt[]>([]);
  const [cats, setCats] = useState<CategoriaOpt[]>([]);
  const [marcas, setMarcas] = useState<MarcaOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicado, setDuplicado] = useState<{
    id: number;
    nombre: string;
    sucursales: { id: number; nombre: string }[];
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  /**
   * Campos que siguen colgados del catálogo. Se arranca con lo que dice el
   * servidor y se va vaciando a medida que el usuario edita: tocar un campo
   * heredado es, justamente, decidir que este local quiere el suyo.
   */
  const [heredado, setHeredado] = useState<Partial<Record<CampoHeredable, boolean>>>(initial.heredado ?? {});
  const editandoSucursal = !!sucursalId && !!initial.id;
  const esHeredado = (campo: CampoHeredable) => editandoSucursal && heredado[campo] === true;
  /** Marca el campo como propio del local (lo saca de la herencia). */
  const hacerPropio = (campo: CampoHeredable) =>
    setHeredado(prev => (prev[campo] ? { ...prev, [campo]: false } : prev));
  /** Vuelve a colgar el campo del catálogo; el valor se recupera al recargar. */
  const volverAHeredar = (campo: CampoHeredable) =>
    setHeredado(prev => ({ ...prev, [campo]: true }));

  useEffect(() => {
    // Se cargan también los inactivos para poder detectar y señalar recetas que
    // referencian insumos dados de baja (el selector solo ofrece los activos).
    //
    // Con una sucursal, solo los insumos que ESE local maneja: una receta no
    // puede descontar stock que el local no tiene. Los que la receta ya usa
    // viajan en `incluir_ids` para que sigan visibles aunque el local no los
    // maneje — así una ficha vieja se muestra completa en vez de perder líneas.
    const yaEnReceta = initial.receta.map(r => r.insumo_id).filter(Boolean);
    const params = new URLSearchParams({ incluir_inactivos: '1' });
    if (sucursalId) params.set('sucursal', String(sucursalId));
    if (sucursalId && yaEnReceta.length > 0) params.set('incluir_ids', yaEnReceta.join(','));
    apiClient.get(`/api/insumo?${params}`).then(r => setInsumos(Array.isArray(r.data) ? r.data : r.data?.data ?? [])).catch(() => setInsumos([]));
    apiClient.get('/api/categoria').then(r => setCats(Array.isArray(r.data) ? r.data : r.data?.data ?? [])).catch(() => setCats([]));
    apiClient.get('/api/admin/marcas').then(r => setMarcas(r.data?.data ?? r.data?.items ?? [])).catch(() => setMarcas([]));
    // `initial` queda fuera a propósito: es la ficha con la que se abrió el
    // wizard y no cambia mientras está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId]);

  const set = (patch: Partial<WizardInitial>) => setP(prev => ({ ...prev, ...patch }));
  const insumoOf = (id: number) => insumos.find(i => i.id === id);
  const insumosActivos = useMemo(() => insumos.filter(i => i.activo !== false), [insumos]);

  // Datos del insumo de inventario para productos de reventa (paso 3)
  const [reventaInsumo, setReventaInsumo] = useState<ReventaInsumo>(EMPTY_REVENTA);
  const setRev = (patch: Partial<ReventaInsumo>) => setReventaInsumo(prev => ({ ...prev, ...patch }));

  // Al editar un reventa ya vinculado, precargar los datos de su insumo
  useEffect(() => {
    if (p.tipo !== 'REVENTA' || !p.insumo_reventa_id) return;
    const ins = insumos.find(i => i.id === p.insumo_reventa_id);
    if (!ins) return;
    setReventaInsumo({
      unidad_medida: (UNIDADES.includes(ins.unidad_medida as UnidadMedida) ? ins.unidad_medida : 'UNIDAD') as UnidadMedida,
      stock: ins.stock_actual ?? 0,
      costo_unitario: ins.costo_promedio ?? 0,
      punto_reorden: ins.stock_minimo ?? 0,
      nivel_critico: ins.punto_critico ?? 0,
      proveedor: ins.proveedor ?? '',
    });
  }, [insumos, p.insumo_reventa_id, p.tipo]);

  const STEPS = ['Básicos', 'Precio & Foto', p.tipo === 'REVENTA' ? 'Inventario' : 'Receta', 'Revisar'];

  const uploadImagen = async (file: File) => {
    setUploading(true); setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await apiClient.post('/api/admin/upload', fd, { headers: { 'Content-Type': undefined } });
      set({ imagen_url: r.data.url as string });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setUploadError(err?.response?.data?.error ?? 'No se pudo subir la imagen');
    } finally { setUploading(false); }
  };

  /* ---- métricas en vivo ---- */
  const cost = useMemo(() => {
    if (p.tipo === 'REVENTA') return reventaInsumo.costo_unitario;
    return computeRecipeCost(p.receta.map(r => ({ costo: insumoOf(r.insumo_id)?.costo_promedio ?? 0, cantidad: r.cantidad_utilizada })));
  }, [p.tipo, p.receta, reventaInsumo.costo_unitario, insumos]);
  const margin = p.precio - cost;
  const fc = foodCostPct(cost, p.precio);
  const rinde = p.tipo === 'REVENTA'
    ? Math.floor(reventaInsumo.stock)
    : buildablePortions(p.receta.map(r => ({ stock: insumoOf(r.insumo_id)?.stock_actual ?? 0, cantidad: r.cantidad_utilizada })));
  const clazz = classifyMenu(0, margin, avgSales, avgMargin);

  /* ---- gate de publicación ---- */
  const gate: string[] = [];
  if (!p.nombre.trim()) gate.push('Define el nombre del producto.');
  if (!(p.precio > 0)) gate.push('Define un precio de venta.');
  if (p.marcas.length === 0) gate.push('Asigna al menos un menú.');
  if (
    p.tipo === 'ELABORADO'
    && (p.receta.length === 0 || p.receta.some(item => !item.insumo_id || !(item.cantidad_utilizada > 0)))
  ) gate.push('Falta la ficha técnica con insumos y cantidades válidas.');
  const insumosDeBajaEnReceta = p.tipo === 'ELABORADO'
    ? p.receta.filter(item => insumoOf(item.insumo_id)?.activo === false)
    : [];
  if (insumosDeBajaEnReceta.length > 0) {
    gate.push(`La receta usa ${insumosDeBajaEnReceta.length} insumo(s) dado(s) de baja: ${insumosDeBajaEnReceta.map(item => insumoOf(item.insumo_id)?.nombre).join(', ')}. Reemplázalo(s) o quítalo(s).`);
  }
  if (p.tipo === 'REVENTA' && !(reventaInsumo.costo_unitario > 0)) gate.push('Define el costo unitario del insumo de reventa.');
  const canPublish = gate.length === 0;

  const toggleMarca = (id: number) => {
    hacerPropio('marcas');
    set({ marcas: p.marcas.includes(id) ? p.marcas.filter(x => x !== id) : [...p.marcas, id] });
  };

  const updateRecipe = (idx: number, patch: Partial<WizardInitial['receta'][number]>) =>
    set({ receta: p.receta.map((it, i) => i === idx ? { ...it, ...patch } : it) });
  const addRecipe = () => set({ receta: [...p.receta, { insumo_id: insumosActivos[0]?.id ?? 0, cantidad_utilizada: 0.1 }] });
  const removeRecipe = (idx: number) => set({ receta: p.receta.filter((_, i) => i !== idx) });

  /** Habilita acá el producto que ya existe, copiando su receta del local donde está. */
  const habilitarExistente = async () => {
    if (!duplicado || !sucursalId) return;
    setSaving(true); setError('');
    try {
      const origen = duplicado.sucursales.find(s => s.id !== sucursalId)?.id;
      await apiClient.post(`/api/admin/productos/${duplicado.id}/sucursales`, {
        sucursal_id: sucursalId,
        precio: p.precio > 0 ? p.precio : undefined,
        copiar_receta_de: origen,
      });
      onSaved();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err?.response?.data?.error ?? 'No se pudo habilitar el producto acá');
    } finally { setSaving(false); }
  };

  const save = async (publish: boolean, permitirDuplicado = false) => {
    if (publish && !canPublish) {
      setError(`No se puede publicar: ${gate.join(' ')}`);
      return;
    }
    setSaving(true); setError('');
    const estado: WizardInitial['estado_publicacion'] = publish ? 'PUBLICADO' : (p.estado_publicacion === 'ARCHIVADO' ? 'ARCHIVADO' : 'BORRADOR');
    const body: Record<string, unknown> = {
      nombre: p.nombre, descripcion: p.descripcion, precio: p.precio,
      calorias: p.calorias ?? undefined,
      proteina: p.proteina?.trim() ? p.proteina.trim() : undefined,
      tipo: p.tipo, estado_publicacion: estado, disponible: estado === 'PUBLICADO',
      sucursal_id: sucursalId,
      categorias: p.categorias, marcas: p.marcas,
      // Solo los campos persistibles: el estado de edición (ui_*) no viaja a la API
      receta: p.tipo === 'REVENTA' ? [] : p.receta.map(({ insumo_id, cantidad_utilizada }) => ({ insumo_id, cantidad_utilizada })),
      insumo_reventa_id: p.insumo_reventa_id ?? undefined,
      imagen_url: p.imagen_url || undefined,
    };
    // Editando una sucursal se manda la decisión explícita de qué queda
    // heredado; el resto queda propio del local aunque hoy coincida con el
    // catálogo. Editando el catálogo no se manda: no hay de quién heredar.
    if (editandoSucursal) {
      body.heredar = (Object.keys(heredado) as CampoHeredable[]).filter(c => heredado[c]);
    }
    if (p.tipo === 'REVENTA') {
      body.nuevo_insumo_reventa = {
        unidad_medida: reventaInsumo.unidad_medida,
        stock: reventaInsumo.stock,
        costo_unitario: reventaInsumo.costo_unitario,
        punto_reorden: reventaInsumo.punto_reorden,
        nivel_critico: reventaInsumo.nivel_critico,
        proveedor: reventaInsumo.proveedor || undefined,
      };
    }
    try {
      if (p.id) await apiClient.put(`/api/admin/productos/${p.id}`, body);
      else await apiClient.post('/api/admin/productos', { ...body, permitir_duplicado: permitirDuplicado });
      onSaved();
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string; code?: string; producto?: typeof duplicado } } };
      // El nombre ya existe: en vez de crear otro producto igual, se ofrece
      // habilitar el que está en la otra sucursal.
      if (err?.response?.status === 409 && err.response.data?.code === 'PRODUCTO_DUPLICADO' && err.response.data.producto) {
        setDuplicado(err.response.data.producto);
      } else {
        setError(err?.response?.data?.error ?? 'Error al guardar el producto');
      }
    } finally { setSaving(false); }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal wide" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2>{p.id ? 'Editar producto' : 'Nuevo producto'}</h2>
            {/* Editar desde una sucursal cambia solo su ficha: el mismo producto
                en los otros locales queda como estaba. */}
            {sucursalNombre && (
              <p className="wizard-scope-note">
                {p.id
                  ? `Los cambios se guardan solo para ${sucursalNombre}. Las demás sucursales no se tocan.`
                  : `Se crea en ${sucursalNombre}.`}
              </p>
            )}
          </div>
          <button className="admin-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="admin-modal-body">
          <div className="wizard-steps">
            {STEPS.map((s, i) => (
              <div key={s} className={`wizard-step ${i === step ? 'active' : i < step ? 'done' : ''}`}>
                <div className="wizard-step-bar" />
                <span className="wizard-step-label">{i + 1}. {s}</span>
              </div>
            ))}
          </div>

          {/* STEP 1 — básicos */}
          {step === 0 && (
            <div className="form-grid">
              <div className="form-group full">
                <label>Nombre</label>
                <input
                  value={p.nombre}
                  onChange={e => { hacerPropio('nombre'); set({ nombre: e.target.value }); }}
                  autoFocus
                />
                {editandoSucursal && (
                  <Herencia heredado={esHeredado('nombre')} onVolverAHeredar={() => volverAHeredar('nombre')} />
                )}
              </div>
              <div className="form-group full">
                <label>Tipo de producto</label>
                <div className="type-choice">
                  {(['ELABORADO', 'REVENTA'] as const).map(t => (
                    <div key={t} className={`type-card ${p.tipo === t ? 'active' : ''}`} onClick={() => set({ tipo: t })}>
                      <h5>{t === 'ELABORADO' ? '🍳 Elaborado' : '🏷️ Reventa'}</h5>
                      <p>{t === 'ELABORADO' ? 'Se prepara en cocina. Requiere receta.' : 'Se compra terminado. Mapeo 1:1 a un insumo.'}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-group full">
                <label>¿En qué menú aparecerá? <span style={{ color: 'var(--orange)' }}>*</span></label>
                <div className="type-choice">
                  {marcas.map(m => {
                    const isElevate = m.nombre.toLowerCase().includes('elevate') || m.key?.toLowerCase() === 'elevate';
                    return (
                      <div
                        key={m.id}
                        className={`type-card ${p.marcas.includes(m.id) ? 'active' : ''}`}
                        onClick={() => toggleMarca(m.id)}
                        style={{ position: 'relative' }}
                      >
                        {p.marcas.includes(m.id) && (
                          <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 16 }}>✓</span>
                        )}
                        <h5>{isElevate ? '🥗 Catering Elevate' : '🏋️ Elevate × Fitbull'}</h5>
                        <p style={{ fontSize: '0.78rem' }}>
                          {isElevate
                            ? 'Bowls, ensaladas, wraps y bebidas saludables del menú principal'
                            : 'Nutrición deportiva de alto rendimiento para atletas y gym'}
                        </p>
                      </div>
                    );
                  })}
                  {marcas.length === 0 && (
                    <span className="form-hint">No hay marcas. Ejecuta <code>npx prisma db seed</code> para crearlas.</span>
                  )}
                </div>
                <span className="form-hint">Puedes asignar el producto a uno o ambos menús a la vez.</span>
                {editandoSucursal && (
                  <Herencia heredado={esHeredado('marcas')} onVolverAHeredar={() => volverAHeredar('marcas')} />
                )}
              </div>
              <div className="form-group">
                <label>Categoría</label>
                <select value={p.categorias[0] ?? ''} onChange={e => { hacerPropio('categorias'); set({ categorias: e.target.value ? [+e.target.value] : [] }); }}>
                  <option value="" disabled>Selecciona…</option>
                  {cats.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                {editandoSucursal && (
                  <Herencia heredado={esHeredado('categorias')} onVolverAHeredar={() => volverAHeredar('categorias')} />
                )}
              </div>
              <div className="form-group full">
                <label>Descripción (opcional)</label>
                <textarea rows={3} value={p.descripcion} onChange={e => { hacerPropio('descripcion'); set({ descripcion: e.target.value }); }} />
                {editandoSucursal && (
                  <Herencia heredado={esHeredado('descripcion')} onVolverAHeredar={() => volverAHeredar('descripcion')} />
                )}
              </div>
            </div>
          )}

          {/* STEP 2 — precio & foto */}
          {step === 1 && (
            <div className="form-grid">
              <div className="form-group"><label>Precio venta (Bs)</label><input type="number" value={p.precio || ''} onChange={e => set({ precio: +e.target.value })} /></div>
              <div className="form-group">
                <label>Calorías (opcional)</label>
                <input type="number" min="0" value={p.calorias ?? ''} onChange={e => { hacerPropio('calorias'); set({ calorias: e.target.value ? +e.target.value : null }); }} />
                {editandoSucursal && (
                  <Herencia heredado={esHeredado('calorias')} onVolverAHeredar={() => volverAHeredar('calorias')} />
                )}
              </div>
              <div className="form-group">
                <label>Proteína (opcional)</label>
                <input value={p.proteina ?? ''} onChange={e => { hacerPropio('proteina'); set({ proteina: e.target.value }); }} placeholder="30g" />
                {editandoSucursal && (
                  <Herencia heredado={esHeredado('proteina')} onVolverAHeredar={() => volverAHeredar('proteina')} />
                )}
              </div>
              <div className="form-group full">
                <label>Foto del producto</label>
                <label
                  className="admin-btn secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: uploading ? 'wait' : 'pointer', width: 'fit-content' }}
                >
                  {uploading ? 'Subiendo…' : '📁 Subir desde mi equipo'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    style={{ display: 'none' }}
                    disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadImagen(f); e.target.value = ''; }}
                  />
                </label>
                <span className="form-hint">JPG, PNG, WEBP, GIF o AVIF · máximo 5 MB. También puedes pegar una URL abajo.</span>
                {uploadError && <span className="form-hint" style={{ color: 'var(--orange)' }}>{uploadError}</span>}
              </div>
              <div className="form-group full">
                <label>O pega una URL de imagen</label>
                <input value={p.imagen_url ?? ''} onChange={e => set({ imagen_url: e.target.value })} placeholder="https://... o /uploads/..." />
              </div>
              {p.imagen_url && <div className="form-group full"><img src={p.imagen_url} className="photo-preview" alt="preview" /></div>}
            </div>
          )}

          {/* STEP 3 — receta */}
          {step === 2 && (
            p.tipo === 'REVENTA' ? (
              <div className="form-grid">
                <div className="form-group full">
                  <span className="form-hint">
                    Este producto de reventa se registrará automáticamente en <strong>Insumos</strong> como
                    «{p.nombre || 'producto'}». 1 producto vendido = 1 unidad descontada.
                  </span>
                </div>
                <div className="form-group">
                  <label>Unidad</label>
                  <select value={reventaInsumo.unidad_medida} onChange={e => setRev({ unidad_medida: e.target.value as UnidadMedida })}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Stock{p.insumo_reventa_id ? ' (solo lectura)' : ' inicial'}</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={reventaInsumo.stock || ''}
                    onChange={e => setRev({ stock: +e.target.value })}
                    placeholder="0"
                    disabled={!!p.insumo_reventa_id}
                    title={p.insumo_reventa_id ? 'El stock se corrige desde Inventario (ajustes), no editando el producto' : undefined}
                  />
                  {p.insumo_reventa_id ? (
                    <span className="form-hint">El stock se gestiona desde <strong>Inventario</strong> (compras/ajustes).</span>
                  ) : null}
                </div>
                <div className="form-group">
                  <label>Costo unitario (Bs)</label>
                  <input type="number" step="0.01" min="0" value={reventaInsumo.costo_unitario || ''} onChange={e => setRev({ costo_unitario: +e.target.value })} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Punto de reorden</label>
                  <input type="number" step="0.01" min="0" value={reventaInsumo.punto_reorden || ''} onChange={e => setRev({ punto_reorden: +e.target.value })} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Nivel crítico</label>
                  <input type="number" step="0.01" min="0" value={reventaInsumo.nivel_critico || ''} onChange={e => setRev({ nivel_critico: +e.target.value })} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Proveedor</label>
                  <input value={reventaInsumo.proveedor} onChange={e => setRev({ proveedor: e.target.value })} placeholder="Opcional" />
                </div>
                <div className="form-group full" style={{ fontWeight: 600 }}>
                  Costo: <span style={{ color: 'var(--orange)' }}>Bs {cost.toFixed(2)}</span> · Rinde actual: <span style={{ color: 'var(--orange)' }}>{rinde}</span>
                </div>
              </div>
            ) : (
              <div>
                <p className="form-hint" style={{ marginBottom: 12 }}>Agrega insumos de la ficha técnica. El costo se calcula en vivo.</p>
                {p.receta.map((it, idx) => {
                  const ins = insumoOf(it.insumo_id);
                  const esDeBaja = ins?.activo === false;
                  const base = ins?.unidad_medida ?? '';
                  const opciones = unidadesEntrada(base);
                  const uiUnidad = it.ui_unidad ?? base.trim().toUpperCase();
                  const uiTxt = it.ui_txt ?? (it.cantidad_utilizada ? String(it.cantidad_utilizada) : '');
                  const costoFila = (ins?.costo_promedio ?? 0) * it.cantidad_utilizada;
                  const convertida = uiUnidad !== base.trim().toUpperCase();

                  const cambiarCantidad = (txt: string, unidad: string) => {
                    const n = parseFloat(txt);
                    const enBase = Number.isFinite(n) && n > 0 ? redondearCantidad(convertir(n, unidad, base) ?? n) : 0;
                    updateRecipe(idx, { ui_txt: txt, ui_unidad: unidad, cantidad_utilizada: enBase });
                  };

                  return (
                    <div key={idx}>
                      <div className="recipe-builder-row" style={esDeBaja ? { border: '1px solid var(--danger)', borderRadius: 8, padding: 6 } : undefined}>
                        <InsumoPicker
                          opciones={insumosActivos}
                          seleccionado={ins}
                          esDeBaja={esDeBaja}
                          onPick={id => updateRecipe(idx, { insumo_id: id, ui_txt: undefined, ui_unidad: undefined })}
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0"
                          value={uiTxt}
                          onChange={e => cambiarCantidad(e.target.value, uiUnidad)}
                        />
                        {opciones.length > 1 ? (
                          <select
                            value={uiUnidad}
                            onChange={e => cambiarCantidad(uiTxt, e.target.value)}
                            style={{ fontSize: '0.8rem', width: 'auto' }}
                          >
                            {opciones.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                        ) : (
                          <span className="dim" style={{ fontSize: '0.8rem' }}>{ins?.unidad_medida}</span>
                        )}
                        <button className="action-btn delete" onClick={() => removeRecipe(idx)}>×</button>
                      </div>
                      {it.cantidad_utilizada > 0 && (
                        <div className="dim" style={{ fontSize: '0.78rem', margin: '2px 0 8px 2px' }}>
                          {convertida ? `= ${it.cantidad_utilizada} ${base.toLowerCase()} · ` : ''}Bs {costoFila.toFixed(2)} de este insumo
                        </div>
                      )}
                      {esDeBaja && (
                        <div style={{ color: 'var(--danger)', fontSize: '0.78rem', margin: '4px 0 8px 2px' }}>
                          Este insumo fue dado de baja. Selecciona un reemplazo o elimina la fila (×) para poder publicar.
                        </div>
                      )}
                    </div>
                  );
                })}
                <button className="admin-btn secondary" onClick={addRecipe} style={{ marginTop: 8 }} disabled={insumosActivos.length === 0}>+ Agregar insumo</button>
                <div style={{ marginTop: 16, fontWeight: 600 }}>Costo calculado: <span style={{ color: 'var(--orange)' }}>Bs {cost.toFixed(2)}</span></div>
              </div>
            )
          )}

          {/* STEP 4 — revisar */}
          {step === 3 && (
            <div>
              <div className="review-stats">
                <div className="review-stat"><div className="review-stat-label">Food Cost</div><div className="review-stat-val" style={{ color: foodCostColor(fc) }}>{Math.round(fc)}%</div></div>
                <div className="review-stat"><div className="review-stat-label">Margen contribución</div><div className="review-stat-val" style={{ color: 'var(--fresh)' }}>Bs {margin.toFixed(1)}</div></div>
                <div className="review-stat"><div className="review-stat-label">Clasificación</div><div className="review-stat-val">{menuClassMeta[clazz].icon} {clazz}</div></div>
                <div className="review-stat"><div className="review-stat-label">Rinde</div><div className="review-stat-val">{rinde} porc.</div></div>
              </div>
              {!canPublish && (
                <div className="gate-warning">
                  <strong>No se puede publicar todavía:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{gate.map((g, i) => <li key={i}>{g}</li>)}</ul>
                </div>
              )}
              {canPublish && fc > 40 && (
                <div className="gate-warning" style={{ background: 'rgba(232,163,23,.1)', borderColor: 'rgba(232,163,23,.3)', color: 'var(--amber)' }}>
                  Food Cost {Math.round(fc)}% — alto. Puedes publicar igual, pero revisa precio o receta.
                </div>
              )}
              {error && <div className="gate-warning" style={{ marginTop: 12 }}>{error}</div>}
            </div>
          )}
        </div>

        {/* Ya existe un producto con ese nombre: casi siempre es el de otra
            sucursal que se está recreando a mano. Duplicarlo parte las ventas
            en dos en la analítica, así que primero se ofrece habilitarlo. */}
        {duplicado && (
          <div className="dup-aviso">
            <strong>«{duplicado.nombre}» ya existe en el catálogo.</strong>
            <p>
              {duplicado.sucursales.length > 0
                ? `Está habilitado en ${duplicado.sucursales.map(s => s.nombre).join(', ')}.`
                : 'Todavía no está habilitado en ninguna sucursal.'}
              {' '}Si es el mismo plato, conviene habilitarlo acá en vez de crear otro:
              así las ventas de los dos locales se suman al mismo producto y podés compararlos.
            </p>
            <div className="dup-acciones">
              {sucursalId && (
                <button className="admin-btn primary" onClick={habilitarExistente} disabled={saving}>
                  Habilitar el existente acá
                </button>
              )}
              <button
                className="admin-btn"
                onClick={() => { setDuplicado(null); save(p.estado_publicacion === 'PUBLICADO', true); }}
                disabled={saving}
              >
                Crear uno nuevo igual
              </button>
              <button className="admin-btn ghost" onClick={() => setDuplicado(null)} disabled={saving}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="admin-modal-footer">
          {step > 0 && <button className="admin-btn ghost" onClick={() => setStep(step - 1)}>← Atrás</button>}
          <div style={{ flex: 1 }} />
          {step < 3 ? (
            <button className="admin-btn primary" onClick={() => setStep(step + 1)} disabled={step === 0 && !p.nombre}>Siguiente →</button>
          ) : (
            <>
              <button className="admin-btn secondary" onClick={() => save(false)} disabled={saving}>{saving ? 'Guardando…' : 'Guardar borrador'}</button>
              <button className="admin-btn primary" onClick={() => save(true)} disabled={saving} title={canPublish ? '' : 'Completa los requisitos'}>Publicar al menú</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

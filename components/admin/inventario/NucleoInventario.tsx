'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '@/hooks/api';
import { convertir } from '@/lib/unidades';
import type { AmbitoInventario } from './ambitos';
import {
  CostoAyuda,
  MOVEMENT_META,
  STOCK_META,
  UNIDADES_MEDIDA,
  coverage,
  errorMsg,
  formatDate,
  medidaInfo,
  money,
  number,
  stockState,
  type EstadoStock,
  type Insumo,
  type Movimiento,
} from './comunes';

/**
 * El inventario de una sucursal y el del Centro de Producción son la misma
 * pantalla sobre stock de distinto dueño: la tabla, los modales de compra,
 * merma y conteo, y el kardex de movimientos no cambian de un lado al otro.
 * Todo eso vive acá y se parametriza con un `AmbitoInventario`.
 *
 * Lo que sí cambia —el selector de sucursal, el consolidado del negocio,
 * copiar insumos entre locales, la baja y la reactivación por local, las
 * recetas y las unidades— NO está acá: es el marco de cada pantalla, que
 * envuelve a este núcleo y le pasa lo suyo por props.
 */

type AccionStock = 'compra' | 'merma' | 'conteo' | null;

interface FormStock {
  cantidad: string;
  costo_unitario: string;
  descripcion: string;
  nuevo_stock: string;
}

const FORM_VACIO: FormStock = { cantidad: '', costo_unitario: '', descripcion: '', nuevo_stock: '' };

export interface PropsNucleoInventario {
  ambito: AmbitoInventario;
  /**
   * A qué contexto del ámbito se le mira el stock: la sucursal o el centro.
   * 0 significa "sin contexto" y solo es legítimo en los ámbitos que lo
   * admiten (`contextoOpcional`): en sucursal es el consolidado del negocio.
   * Cuando el ámbito exige contexto, montar el núcleo con 0 es un error de la
   * pantalla y el núcleo lo dice en vez de mandar un body que dará 422.
   */
  contextoId: number;
  /**
   * Pestaña visible. La barra de pestañas es del marco; con 'oculto' el núcleo
   * no dibuja nada pero sigue montado, para que pasar por otra pestaña no
   * cueste una recarga del inventario ni borre el filtro escrito.
   */
  vista: 'insumos' | 'movimientos' | 'oculto';
  /**
   * Mientras el marco no resolvió su contexto (qué sucursal está mirando, por
   * ejemplo) no se pide nada: esa primera respuesta llegaría con el contexto
   * sin resolver y podría pisar a la correcta.
   */
  habilitado?: boolean;
  /** Vista del cajero: sin columna de acciones ni modales. */
  readOnly?: boolean;
  /**
   * Cuando la fila suma varios contextos (el consolidado de sucursales), el
   * semáforo de nivel mentiría: puede decir "OK" mientras un local está en
   * cero. En ese caso se muestra la leyenda y no se ofrece filtrar por estado.
   */
  estadoNoEsReal?: boolean;
  /** Sube la lista recién cargada: el marco arma sus KPIs con la misma data. */
  onInsumos?: (insumos: Insumo[]) => void;
  /** Cambiar este número fuerza una recarga (el marco tocó algo de afuera). */
  refresco?: number;
  /** Qué decir cuando el ámbito todavía no maneja ningún insumo. */
  mensajeSinInsumos: string;
  /** Botón de alta que ofrece ese vacío; el alta es del marco. */
  accionSinInsumos?: ReactNode;
  /** Acciones sobre la ficha del insumo (editar): van antes de las de stock. */
  accionesFicha?: (insumo: Insumo) => ReactNode;
  /** Acciones de alcance (baja, quitar del contexto): van después. */
  accionesAlcance?: (insumo: Insumo) => ReactNode;
  /** Acciones para un insumo dado de baja (reactivar). */
  accionesInactivo?: (insumo: Insumo) => ReactNode;
}

/**
 * Lee la lista de una respuesta sin atarse a la forma exacta del endpoint: hay
 * handlers que devuelven el array pelado, otros que lo envuelven en `items` o
 * en `data`. Sin esto el núcleo necesitaría saber en qué ámbito está.
 */
function listaDe<T>(cuerpo: unknown): T[] {
  if (Array.isArray(cuerpo)) return cuerpo as T[];
  const envoltorio = cuerpo as { items?: unknown; data?: unknown } | null | undefined;
  if (Array.isArray(envoltorio?.items)) return envoltorio.items as T[];
  if (Array.isArray(envoltorio?.data)) return envoltorio.data as T[];
  return [];
}

export default function NucleoInventario({
  ambito,
  contextoId,
  vista,
  habilitado = true,
  readOnly = false,
  estadoNoEsReal = false,
  onInsumos,
  refresco = 0,
  mensajeSinInsumos,
  accionSinInsumos,
  accionesFicha,
  accionesAlcance,
  accionesInactivo,
}: PropsNucleoInventario) {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | EstadoStock>('todos');
  const [selectedCategorias, setSelectedCategorias] = useState<string[]>([]);
  const [categoriaMenuOpen, setCategoriaMenuOpen] = useState(false);
  const [vistaInsumos, setVistaInsumos] = useState<'activos' | 'baja'>('activos');

  // Al pasar a la vista sumada, un filtro por estado dejaría de tener sentido.
  useEffect(() => {
    if (estadoNoEsReal) setStatusFilter('todos');
  }, [estadoNoEsReal]);

  // El marco recibe la lista tal cual llegó; por ref para que redefinir el
  // callback en cada render del marco no dispare una recarga.
  const avisar = useRef(onInsumos);
  useEffect(() => { avisar.current = onInsumos; });

  /**
   * Carga en curso. Al abrir la pantalla se pide una vez con el contexto sin
   * resolver y otra apenas el marco dice cuál es; sin este número la primera
   * puede llegar después y pisar a la correcta, dejando el inventario de otro
   * contexto en pantalla hasta recargar.
   */
  const pedido = useRef(0);

  /**
   * Las dos peticiones salen juntas pero fallan por separado, a propósito y a
   * diferencia de como estaba antes del refactor —un `Promise.all` con un
   * `catch` común que vaciaba las dos listas—.
   *
   * El stock y el kardex no dependen entre sí, y el usuario abre esta pantalla
   * para ver su stock: que se caiga el historial de movimientos no puede
   * dejarlo sin inventario en pantalla. Esto no es un lujo: el ámbito del
   * Centro todavía no tiene endpoint de movimientos, así que con el
   * comportamiento viejo su 404 vaciaba también la tabla de stock y mandaba a
   * buscar el bug al endpoint de inventario, que está sano.
   */
  const load = useCallback(async () => {
    const mio = ++pedido.current;
    setLoading(true);
    const [resStock, resKardex] = await Promise.allSettled([
      apiClient.get(ambito.listarUrl(contextoId)),
      apiClient.get(ambito.kardexUrl(contextoId)),
    ]);
    if (mio !== pedido.current) return; // llegó tarde: ya hay una carga más nueva

    if (resStock.status === 'fulfilled') {
      const lista = listaDe<Insumo>(resStock.value.data);
      setInsumos(lista);
      avisar.current?.(lista);
    } else {
      console.error(resStock.reason);
      setInsumos([]);
      avisar.current?.([]);
    }

    if (resKardex.status === 'fulfilled') {
      setMovimientos(listaDe<Movimiento>(resKardex.value.data));
    } else {
      console.error(resKardex.reason);
      setMovimientos([]);
    }

    setLoading(false);
  }, [ambito, contextoId]);

  useEffect(() => {
    if (!habilitado) return;
    load();
  }, [load, habilitado, refresco]);

  const insumosActivos = useMemo(() => insumos.filter(i => i.activo), [insumos]);
  // Base de la vista actual: activos o dados de baja (los filtros de stock cuentan sobre esta)
  const insumosVista = useMemo(
    () => (vistaInsumos === 'baja' ? insumos.filter(i => !i.activo) : insumosActivos),
    [vistaInsumos, insumos, insumosActivos],
  );

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

  // ── Modales de stock: compra, merma y conteo ────────────────────────────
  const [modalAction, setModalAction] = useState<AccionStock>(null);
  const [selected, setSelected] = useState<Insumo | null>(null);
  const [form, setForm] = useState<FormStock>(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Modo "por envases" en compra/conteo: el usuario teclea envases y el
  // sistema convierte a la unidad base del insumo antes de enviar a la API.
  // Clave de idempotencia del intento en curso. Se renueva al ABRIR el modal,
  // no al enviar: así un reintento (doble clic, respuesta que no volvió) manda
  // la misma clave y el servidor lo rechaza en vez de duplicar la compra y
  // recalcular el costo promedio con el doble de volumen.
  const [claveIdempotencia, setClaveIdempotencia] = useState('');
  const [envaseModo, setEnvaseModo] = useState(false);
  const [envaseCant, setEnvaseCant] = useState('');
  const [envaseTam, setEnvaseTam] = useState('');
  const [envaseTotal, setEnvaseTotal] = useState('');

  const openModal = (action: AccionStock, insumo: Insumo) => {
    setFormError('');
    setModalAction(action);
    setClaveIdempotencia(crypto.randomUUID());
    setSelected(insumo);
    setEnvaseModo(false);
    setEnvaseCant('');
    setEnvaseTotal('');
    // Tamaño del envase: precargado desde el contenido por unidad si es compatible
    const tam = insumo.equivalencia_cantidad != null && insumo.equivalencia_unidad
      ? convertir(insumo.equivalencia_cantidad, insumo.equivalencia_unidad, insumo.unidad_medida)
      : null;
    setEnvaseTam(tam && tam > 0 ? String(Number(tam.toFixed(4))) : '');
    setForm({ ...FORM_VACIO, nuevo_stock: String(insumo.stock_actual) });
  };

  const closeModal = () => {
    setModalAction(null);
    setSelected(null);
    setForm(FORM_VACIO);
    setFormError('');
    setEnvaseModo(false);
    setEnvaseCant('');
    setEnvaseTam('');
    setEnvaseTotal('');
  };

  // Modo envases: cálculos derivados (conversión visible antes de guardar)
  const selEsMedida = selected ? UNIDADES_MEDIDA.includes(selected.unidad_medida.trim().toUpperCase()) : false;
  const selSufijo = selected ? medidaInfo(selected.unidad_medida).sufijo : '';
  const envN = parseFloat(envaseCant);
  const envT = parseFloat(envaseTam);
  const envTotalN = parseFloat(envaseTotal);
  const envCantidadBase = Number.isFinite(envN) && envN > 0 && Number.isFinite(envT) && envT > 0
    ? Number((envN * envT).toFixed(4)) : 0;
  const envCostoUnitario = envCantidadBase > 0 && Number.isFinite(envTotalN) && envTotalN > 0
    ? Number((envTotalN / envCantidadBase).toFixed(6)) : 0;
  const usarEnvases = envaseModo && selEsMedida;

  const submitModal = async (event: FormEvent) => {
    event.preventDefault();
    if (usarEnvases && modalAction === 'compra' && (envCantidadBase <= 0 || envCostoUnitario <= 0)) {
      setFormError('Completa envases, tamaño y total pagado (todos mayores a 0).');
      return;
    }
    if (usarEnvases && modalAction === 'conteo' && envCantidadBase <= 0) {
      setFormError('Completa la cantidad de envases y su tamaño (mayores a 0).');
      return;
    }
    // El movimiento se registra en el contexto que se está viendo. Sin
    // contexto la clave no viaja: en sucursal eso es válido y el servidor
    // resuelve la principal (comportamiento previo a multi-sucursal); en un
    // ámbito que la exige, mandar la clave en 0 sería un 422 ilegible, así que
    // se corta acá con un mensaje que apunta al problema real.
    if (!contextoId && !ambito.contextoOpcional) {
      setFormError('No hay un contexto elegido para registrar el movimiento.');
      return;
    }
    setSaving(true);
    setFormError('');
    const contexto = contextoId ? { [ambito.claveContexto]: contextoId } : {};
    try {
      if (modalAction === 'compra' && selected) {
        await apiClient.post(ambito.compraUrl, {
          insumo_id: selected.id,
          cantidad: usarEnvases ? envCantidadBase : Number(form.cantidad || 0),
          costo_unitario: usarEnvases ? envCostoUnitario : Number(form.costo_unitario || 0),
          nota: usarEnvases
            ? [`${envN} envase(s) de ${envT} ${selSufijo}`, form.descripcion].filter(Boolean).join(' — ')
            : form.descripcion || undefined,
          ...contexto,
        }, { headers: { 'Idempotency-Key': claveIdempotencia } });
      }
      if (modalAction === 'merma' && selected) {
        await apiClient.post(ambito.mermaUrl, {
          insumo_id: selected.id,
          cantidad: Number(form.cantidad || 0),
          descripcion: form.descripcion || `Merma de ${selected.nombre}`,
          ...contexto,
        }, { headers: { 'Idempotency-Key': claveIdempotencia } });
      }
      if (modalAction === 'conteo' && selected) {
        await apiClient.post(ambito.conteoUrl, {
          insumo_id: selected.id,
          nuevo_stock: usarEnvases ? envCantidadBase : Number(form.nuevo_stock || 0),
          descripcion: usarEnvases
            ? [`Conteo: ${envN} envase(s) de ${envT} ${selSufijo}`, form.descripcion].filter(Boolean).join(' — ')
            : form.descripcion || undefined,
          ...contexto,
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

  const modalTitle = modalAction === 'compra'
    ? `Registrar compra · ${selected?.nombre ?? ''}`
    : modalAction === 'merma'
      ? `Registrar merma · ${selected?.nombre ?? ''}`
      : `Conteo físico (corregir stock) · ${selected?.nombre ?? ''}`;

  return (
    <>
      {vista === 'insumos' && (
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
              {(estadoNoEsReal
                // Sumando locales el estado no es real, así que no se ofrece
                // filtrar por él: para eso se elige una sucursal.
                ? [['todos', 'Todos', insumosVista.length]]
                : [
                  ['todos', 'Todos', insumosVista.length],
                  ['ok', 'OK', countsVista.ok],
                  ['bajo', 'Bajo', countsVista.bajo],
                  ['critico', 'Crítico', countsVista.critico],
                  ['agotado', 'Agotado', countsVista.agotado],
                ]
              ).map(([key, label, count]) => (
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
              <p>
                {insumos.length > 0
                  ? 'Ajusta los filtros o la búsqueda.'
                  : mensajeSinInsumos}
              </p>
              {insumos.length === 0 && !readOnly && accionSinInsumos}
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
                    {!readOnly && <th>Acciones</th>}
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
                        <td>
                          {estadoNoEsReal ? (
                            // Sumando todos los locales, el semáforo mentiría: puede
                            // dar "OK" mientras una sucursal está en cero. El estado
                            // real se ve eligiendo un local o en Stock por Sucursal.
                            <span className="admin-cell-muted" title="Elige una sucursal para ver su estado de stock">
                              varía por local
                            </span>
                          ) : (
                            <span className={`pub-badge ${meta.className}`} style={{ color: meta.color }}>{meta.label}</span>
                          )}
                        </td>
                        <td className="num"><span className={`stock-val ${!estadoNoEsReal && state !== 'ok' ? 'low' : ''}`}>{number(insumo.stock_actual)} {insumo.unidad_medida}</span></td>
                        <td className="num">{number(insumo.stock_minimo)}</td>
                        <td className="num">{coverage(insumo)}</td>
                        <td className="num">{money(insumo.costo_promedio)}</td>
                        <td className="num">{money(value)}</td>
                        <td>{insumo.proveedor || '—'}</td>
                        {!readOnly && <td>
                          <div className="action-btns">
                            {insumo.activo ? (
                              <>
                                {accionesFicha?.(insumo)}
                                {ambito.permiteCompra && (
                                  <button className="action-btn edit" title="Compra" onClick={() => openModal('compra', insumo)} type="button">↥</button>
                                )}
                                <button className="action-btn delete" title="Merma" onClick={() => openModal('merma', insumo)} type="button">⌫</button>
                                <button className="action-btn" title="Corregir stock (conteo físico) — usa esto si te equivocaste en una cantidad" onClick={() => openModal('conteo', insumo)} type="button">✓</button>
                                {accionesAlcance?.(insumo)}
                              </>
                            ) : (
                              accionesInactivo?.(insumo)
                            )}
                          </div>
                        </td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {vista === 'movimientos' && (
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

      {modalAction && (
        <div className="admin-modal-overlay" onMouseDown={closeModal}>
          <form className="admin-modal" onSubmit={submitModal} onMouseDown={event => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{modalTitle}</h3>
              <button className="admin-modal-close" onClick={closeModal} type="button">×</button>
            </div>
            <div className="admin-modal-body">
              <div className="form-grid">
                {(modalAction === 'compra' || modalAction === 'conteo') && selEsMedida && (
                  <label className="form-group full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={envaseModo} onChange={event => setEnvaseModo(event.target.checked)} />
                    <span>Ingresar por envases (botellas, bolsas, cajas...)</span>
                  </label>
                )}
                {modalAction === 'conteo' ? (
                  usarEnvases ? (
                    <>
                      <label className="form-group"><span>Envases contados</span><input type="number" min="0" step="0.5" placeholder="3.5" value={envaseCant} onChange={event => setEnvaseCant(event.target.value)} required /></label>
                      <label className="form-group"><span>Tamaño del envase ({selSufijo})</span><input type="number" min="0" step="0.01" placeholder="500" value={envaseTam} onChange={event => setEnvaseTam(event.target.value)} required /></label>
                      <div className="form-group full">
                        <span className="form-hint" style={{ fontWeight: 600 }}>
                          {envCantidadBase > 0
                            ? `✓ Nuevo stock: ${number(envCantidadBase)} ${selSufijo} (stock actual: ${selected ? number(selected.stock_actual) : 0} ${selSufijo})`
                            : 'Completa envases y tamaño para ver el nuevo stock.'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="form-group"><span>Stock real</span><input type="number" min="0" step="0.01" value={form.nuevo_stock} onChange={event => setForm(prev => ({ ...prev, nuevo_stock: event.target.value }))} required /></label>
                      <div className="form-group full">
                        <span className="form-hint">
                          Escribe la cantidad correcta (no lo que hay que sumar/restar). El sistema calcula la diferencia contra el stock actual ({selected ? number(selected.stock_actual) : 0} {selected?.unidad_medida}) y la deja registrada como ajuste en el historial de movimientos.
                        </span>
                      </div>
                    </>
                  )
                ) : modalAction === 'compra' && usarEnvases ? (
                  <>
                    <label className="form-group"><span>Envases comprados</span><input type="number" min="0" step="1" placeholder="2" value={envaseCant} onChange={event => setEnvaseCant(event.target.value)} required /></label>
                    <label className="form-group"><span>Tamaño del envase ({selSufijo})</span><input type="number" min="0" step="0.01" placeholder="500" value={envaseTam} onChange={event => setEnvaseTam(event.target.value)} required /></label>
                    <label className="form-group"><span>Pagué en total (Bs)</span><input type="number" min="0" step="0.01" placeholder="10" value={envaseTotal} onChange={event => setEnvaseTotal(event.target.value)} required /></label>
                    <div className="form-group full">
                      <span className="form-hint" style={{ fontWeight: 600 }}>
                        {envCantidadBase > 0 && envCostoUnitario > 0
                          ? `✓ Se registrará: ${number(envCantidadBase)} ${selSufijo} a Bs ${envCostoUnitario} por ${selSufijo}`
                          : 'Completa envases, tamaño y total para ver la conversión.'}
                      </span>
                    </div>
                  </>
                ) : (
                  <label className="form-group"><span>Cantidad{selected ? ` (${selSufijo})` : ''}</span><input type="number" min="0" step="0.01" value={form.cantidad} onChange={event => setForm(prev => ({ ...prev, cantidad: event.target.value }))} required /></label>
                )}
                {modalAction === 'compra' && !usarEnvases && (
                  <>
                    <label className="form-group"><span>Costo unitario{selected ? ` (Bs por ${selSufijo})` : ''}</span><input type="number" min="0" step="0.000001" value={form.costo_unitario} onChange={event => setForm(prev => ({ ...prev, costo_unitario: event.target.value }))} required /></label>
                    {selected && (
                      <CostoAyuda
                        unidadBase={selected.unidad_medida}
                        onCalculado={costo => setForm(prev => ({ ...prev, costo_unitario: costo }))}
                      />
                    )}
                  </>
                )}
                <label className="form-group full"><span>Nota</span><textarea rows={3} value={form.descripcion} onChange={event => setForm(prev => ({ ...prev, descripcion: event.target.value }))} /></label>
              </div>
              {formError && <div className="gate-warning" style={{ marginTop: 12 }}>{formError}</div>}
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn secondary" onClick={closeModal} type="button">Cancelar</button>
              <button className="admin-btn primary" disabled={saving} type="submit">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import apiClient from '@/hooks/api';
import {
  foodCostColor, classifyMenu, menuClassMeta, buildablePortions,
} from './inventoryData';
import AdminProductWizard, { type WizardInitial } from './AdminProductWizard';

type Tipo = 'ELABORADO' | 'REVENTA';
type Estado = 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO' | 'BAJA';

interface ApiProducto {
  id: number;
  nombre: string;
  descripcion: string;
  precio: number;
  imagen_url: string | null;
  disponible: boolean;
  tipo: Tipo;
  estado_publicacion: Estado;
  insumo_reventa_id: number | null;
  ventas_acumuladas: number;
  calorias: number | null;
  proteina: string | null;
  motivo_baja: string | null;
  fecha_baja: string | null;
  en_revision: boolean;
  revision_desde: string | null;
  motivo_revision: string | null;
  insumo_causa_revision_id: number | null;
  categoria_id: { categoria: { id: number; nombre: string } }[];
  marcas: { marca: { id: number; nombre: string } }[];
  recetaProducto_id: {
    insumo_id: number;
    cantidad_utilizada: number;
    insumo?: { stock_actual: number; costo_promedio: number; unidad_medida: string; nombre: string };
  }[];
  costo_calculado: number;
  food_cost_pct: number;
}

const PUB_FILTERS = ['todos', 'PUBLICADO', 'BORRADOR', 'ARCHIVADO'] as const;
const pubLabel: Record<string, string> = { todos: 'Todos', PUBLICADO: 'Publicado', BORRADOR: 'Borrador', ARCHIVADO: 'Archivado' };
const pubBadgeClass: Record<Estado, string> = { PUBLICADO: 'publicado', BORRADOR: 'borrador', ARCHIVADO: 'archivado', BAJA: 'archivado' };

const EditIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const TrashIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;
const BajaIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>;

export default function AdminProducts() {
  const [productos, setProductos] = useState<ApiProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('Todos');
  const [filterPub, setFilterPub] = useState<string>('todos');
  const [wizard, setWizard] = useState<WizardInitial | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [bajaConfirm, setBajaConfirm] = useState<number | null>(null);
  const [bajaMotivo, setBajaMotivo] = useState('');
  const [dbCategorias, setDbCategorias] = useState<string[]>(['Todos']);
  const [actionError, setActionError] = useState('');
  const [vista, setVista] = useState<'activos' | 'en-revision' | 'eliminados'>('activos');
  const [restoreConfirm, setRestoreConfirm] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    apiClient.get('/api/admin/productos')
      .then(res => setProductos(res.data?.data ?? []))
      .catch(() => setProductos([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    apiClient.get('/api/categoria')
      .then(r => {
        const cats: { nombre: string }[] = Array.isArray(r.data) ? r.data : r.data?.data ?? [];
        setDbCategorias(['Todos', ...new Set(cats.map(c => c.nombre))]);
      })
      .catch(() => setDbCategorias(['Todos']));
  }, []);

  // Los productos en BAJA son la "eliminación lógica": no aparecen entre los activos,
  // ni en la tienda, ni en caja, hasta que se restauren desde la pestaña Eliminados.
  const activos = useMemo(() => productos.filter(p => p.estado_publicacion !== 'BAJA' && !p.en_revision), [productos]);
  const enRevision = useMemo(() => productos.filter(p => p.en_revision), [productos]);
  const eliminados = useMemo(() => productos.filter(p => p.estado_publicacion === 'BAJA'), [productos]);

  const publicados = activos.filter(p => p.estado_publicacion === 'PUBLICADO').length;

  const { avgSales, avgMargin } = useMemo(() => {
    const n = activos.length || 1;
    return {
      avgSales: activos.reduce((s, p) => s + (p.ventas_acumuladas || 0), 0) / n,
      avgMargin: activos.reduce((s, p) => s + (p.precio - (p.costo_calculado || 0)), 0) / n,
    };
  }, [activos]);

  const filtered = activos.filter(p => {
    const ms = p.nombre.toLowerCase().includes(search.toLowerCase());
    const mc = filterCat === 'Todos' || p.categoria_id.some(c => c.categoria?.nombre === filterCat);
    const mp = filterPub === 'todos' || p.estado_publicacion === filterPub;
    return ms && mc && mp;
  });

  const eliminadosFiltrados = eliminados.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()),
  );

  const setEstado = async (id: number, estado: Estado) => {
    setActionError('');
    try {
      await apiClient.patch(`/api/admin/productos/${id}`, { estado_publicacion: estado });
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setActionError(err?.response?.data?.error ?? 'No se pudo cambiar el estado. Verifica nombre, descripcion, precio, menu y receta.');
      setTimeout(() => setActionError(''), 6000);
    }
  };

  const darDeBaja = async (id: number) => {
    if (!bajaMotivo.trim()) return;
    setActionError('');
    try {
      await apiClient.patch(`/api/admin/productos/${id}`, { estado_publicacion: 'BAJA', motivo: bajaMotivo.trim() });
      setBajaConfirm(null);
      setBajaMotivo('');
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setBajaConfirm(null);
      setActionError(err?.response?.data?.error ?? 'No se pudo dar de baja el producto.');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  const remove = async (id: number) => {
    setActionError('');
    try {
      await apiClient.delete(`/api/admin/productos/${id}`);
      setDeleteConfirm(null);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      setDeleteConfirm(null);
      if (err?.response?.status === 409) {
        // Tiene ventas: no se puede borrar físicamente sin romper el historial.
        // Se ofrece la baja (eliminación lógica) en su lugar.
        setBajaConfirm(id);
        setBajaMotivo('');
        setActionError('El producto tiene ventas registradas, así que no puede borrarse definitivamente. Indica el motivo y se moverá a "Eliminados" (podrás restaurarlo después).');
        setTimeout(() => setActionError(''), 8000);
      } else {
        setActionError(err?.response?.data?.error ?? 'No se pudo eliminar. El producto puede tener pedidos asociados.');
        setTimeout(() => setActionError(''), 5000);
      }
    }
  };

  const resolverRevision = async (id: number) => {
    setActionError('');
    try {
      await apiClient.patch(`/api/productos/${id}/resolver-revision`);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setActionError(err?.response?.data?.error ?? 'No se pudo marcar como resuelto.');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  const restaurar = async (id: number) => {
    setActionError('');
    try {
      // Vuelve como BORRADOR: no se muestra en tienda ni en caja hasta que se publique.
      await apiClient.patch(`/api/admin/productos/${id}`, { estado_publicacion: 'BORRADOR' });
      setRestoreConfirm(null);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setRestoreConfirm(null);
      setActionError(err?.response?.data?.error ?? 'No se pudo restaurar el producto.');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  const openCreate = () => setWizard({
    nombre: '', descripcion: '', precio: 0, calorias: null, proteina: null,
    tipo: 'ELABORADO', estado_publicacion: 'BORRADOR', imagen_url: null,
    categorias: [], marcas: [], receta: [], insumo_reventa_id: null,
  });

  const openEdit = (p: ApiProducto) => setWizard({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion ?? '',
    precio: p.precio,
    calorias: p.calorias,
    proteina: p.proteina,
    tipo: p.tipo,
    estado_publicacion: p.estado_publicacion === 'BAJA' ? 'BORRADOR' : p.estado_publicacion,
    imagen_url: p.imagen_url,
    categorias: p.categoria_id.map(c => c.categoria.id),
    marcas: p.marcas.map(m => m.marca.id),
    receta: p.recetaProducto_id.map(r => ({ insumo_id: r.insumo_id, cantidad_utilizada: r.cantidad_utilizada })),
    insumo_reventa_id: p.insumo_reventa_id,
  });

  return (
    <div className="admin-products">
      <div className="admin-page-header">
        <div>
          <h1>Productos</h1>
          <p>{activos.length} productos · {publicados} publicados{enRevision.length > 0 ? ` · ${enRevision.length} en revisión` : ''}{eliminados.length > 0 ? ` · ${eliminados.length} eliminados` : ''}</p>
        </div>
        <button className="admin-btn primary" onClick={openCreate}>+ Nuevo Producto</button>
      </div>

      <div className="admin-cat-filters" style={{ marginBottom: 16 }}>
        <button className={`cat-filter-btn ${vista === 'activos' ? 'active' : ''}`} onClick={() => setVista('activos')}>
          Activos ({activos.length})
        </button>
        {enRevision.length > 0 && (
          <button className={`cat-filter-btn ${vista === 'en-revision' ? 'active' : ''}`} onClick={() => setVista('en-revision')} style={{ borderColor: 'var(--amber)', color: vista === 'en-revision' ? 'var(--amber)' : 'inherit' }}>
            ⚠️ En Revisión ({enRevision.length})
          </button>
        )}
        <button className={`cat-filter-btn ${vista === 'eliminados' ? 'active' : ''}`} onClick={() => setVista('eliminados')}>
          Eliminados / De baja ({eliminados.length})
        </button>
      </div>

      <div className="admin-filters">
        <div className="admin-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {vista === 'activos' && (
          <div className="admin-cat-filters">
            {PUB_FILTERS.map(f => (
              <button key={f} className={`cat-filter-btn ${filterPub === f ? 'active' : ''}`} onClick={() => setFilterPub(f)}>{pubLabel[f]}</button>
            ))}
          </div>
        )}
      </div>
      {vista === 'activos' && (
        <div className="admin-cat-filters" style={{ marginBottom: 20 }}>
          {dbCategorias.map(cat => (
            <button key={cat} className={`cat-filter-btn ${filterCat === cat ? 'active' : ''}`} onClick={() => setFilterCat(cat)}>{cat}</button>
          ))}
        </div>
      )}
      {actionError && (
        <div style={{ background: 'rgba(229,72,77,0.12)', border: '1px solid rgba(229,72,77,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 14, color: 'var(--danger)', fontSize: 13 }}>
          ⚠️ {actionError}
        </div>
      )}

      {vista === 'en-revision' ? (
        <>
          <div className="dashboard-grid">
            {enRevision.length === 0 ? (
              <div className="empty-state">
                <h4>Sin productos en revisión</h4>
                <p>Los productos que necesiten ajustes aparecerán aquí.</p>
              </div>
            ) : (
              enRevision.map(p => (
                <div key={p.id} className="dash-card span-4" style={{ borderLeft: '3px solid var(--amber)' }}>
                  <div className="dash-card-header">
                    <h3>{p.nombre}</h3>
                    <span className="dash-card-sub" style={{ color: 'var(--amber)', fontWeight: 600 }}>⚠️ EN REVISIÓN</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                    {p.revision_desde && (
                      <div>
                        <span className="form-hint">Desde:</span>
                        <div style={{ fontSize: 12 }}>
                          {new Date(p.revision_desde).toLocaleDateString('es-BO', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    )}
                    {p.motivo_revision && (
                      <div>
                        <span className="form-hint">Motivo:</span>
                        <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 4 }}>
                          {p.motivo_revision}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="admin-btn primary" style={{ flex: 1 }} onClick={() => openEdit(p)}>
                      ✏ Editar receta
                    </button>
                    <button
                      type="button"
                      className="admin-btn secondary"
                      title="Quitar la marca de revisión sin editar (ej. si el insumo ya fue reactivado)"
                      onClick={() => resolverRevision(p.id)}
                    >
                      ✓ Resuelto
                    </button>
                  </div>
                  <p className="form-hint" style={{ marginTop: 8 }}>
                    Al guardar la receta sin insumos de baja, o al dar de baja el producto, la revisión se resuelve sola.
                  </p>
                </div>
              ))
            )}
          </div>
        </>
      ) : vista === 'eliminados' ? (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Producto</th><th className="num">Precio</th><th>Motivo de baja</th><th>Fecha de baja</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {eliminadosFiltrados.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className="product-cell">
                        <span className="product-cell-name">{p.nombre}</span>
                        <span className="product-cell-desc">{(p.descripcion ?? '').slice(0, 50)}{(p.descripcion ?? '').length > 50 ? '…' : ''}</span>
                      </div>
                    </td>
                    <td className="num">Bs {p.precio}</td>
                    <td>{p.motivo_baja || '—'}</td>
                    <td>{p.fecha_baja ? new Date(p.fecha_baja).toLocaleDateString() : '—'}</td>
                    <td>
                      <div className="action-btns">
                        {restoreConfirm === p.id ? (
                          <div className="delete-confirm">
                            <button className="action-btn confirm-yes" onClick={() => restaurar(p.id)}>Sí</button>
                            <button className="action-btn confirm-no" onClick={() => setRestoreConfirm(null)}>No</button>
                          </div>
                        ) : (
                          <button className="admin-btn" onClick={() => setRestoreConfirm(p.id)} title="Restaurar como borrador">↩ Restaurar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && eliminadosFiltrados.length === 0 && (
            <div className="empty-state">
              <h4>Sin productos eliminados</h4>
              <p>Los productos dados de baja aparecerán aquí y podrás restaurarlos.</p>
            </div>
          )}
        </>
      ) : (
      <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Producto</th><th>Tipo</th><th className="num">Precio</th><th className="num">Costo</th>
              <th className="num">Food Cost</th><th>Clase</th><th className="num">Rinde</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const costo = p.costo_calculado ?? 0;
              const fc = p.food_cost_pct ?? 0;
              const margin = p.precio - costo;
              const clazz = classifyMenu(p.ventas_acumuladas || 0, margin, avgSales, avgMargin);
              const noRecipe = p.tipo === 'ELABORADO' && p.recetaProducto_id.length === 0;
              const rinde = p.tipo === 'REVENTA'
                ? '—'
                : buildablePortions(p.recetaProducto_id.map(r => ({ stock: r.insumo?.stock_actual ?? 0, cantidad: r.cantidad_utilizada })));
              const pub = p.estado_publicacion;
              return (
                <tr key={p.id}>
                  <td>
                    <div className="product-cell">
                      <span className="product-cell-name">
                        {p.nombre}
                        {noRecipe && <span className="pub-badge borrador" style={{ marginLeft: 6 }}>sin ficha</span>}
                      </span>
                      <span className="product-cell-desc">{(p.descripcion ?? '').slice(0, 50)}{(p.descripcion ?? '').length > 50 ? '…' : ''}</span>
                    </div>
                  </td>
                  <td><span className="cat-badge">{p.tipo === 'REVENTA' ? 'Reventa' : 'Elaborado'}</span></td>
                  <td className="num">Bs {p.precio}</td>
                  <td className="num dim">Bs {costo.toFixed(1)}</td>
                  <td className="num"><span className="margin-badge" style={{ color: foodCostColor(fc), background: 'var(--canvas)' }}>{p.precio > 0 ? Math.round(fc) : '—'}%</span></td>
                  <td><span className="menu-class-badge">{menuClassMeta[clazz].icon} {clazz}</span></td>
                  <td className="num"><span className={`stock-val ${rinde === 0 ? 'low' : ''}`}>{rinde}</span></td>
                  <td><span className={`pub-badge ${pubBadgeClass[pub]}`}>{pub.toLowerCase()}</span></td>
                  <td>
                    <div className="action-btns">
                      <button className="action-btn edit" onClick={() => openEdit(p)} title="Editar">{EditIcon}</button>
                      {pub === 'PUBLICADO'
                        ? <button className="action-btn" onClick={() => setEstado(p.id, 'ARCHIVADO')} title="Archivar (pausar venta — vuelve al menú cuando quieras)">⏸</button>
                        : <button className="action-btn" onClick={() => setEstado(p.id, 'PUBLICADO')} title="Publicar al menú">▶</button>}
                      {bajaConfirm === p.id ? (
                        <div className="delete-confirm" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Motivo de la baja"
                            value={bajaMotivo}
                            onChange={e => setBajaMotivo(e.target.value)}
                            style={{ width: 120, fontSize: 12 }}
                            autoFocus
                          />
                          <button className="action-btn confirm-yes" onClick={() => darDeBaja(p.id)} disabled={!bajaMotivo.trim()}>Sí</button>
                          <button className="action-btn confirm-no" onClick={() => { setBajaConfirm(null); setBajaMotivo(''); }}>No</button>
                        </div>
                      ) : (
                        <button className="action-btn delete" onClick={() => { setBajaConfirm(p.id); setBajaMotivo(''); }} title="Dar de baja">{BajaIcon}</button>
                      )}
                      {deleteConfirm === p.id ? (
                        <div className="delete-confirm">
                          <button className="action-btn confirm-yes" onClick={() => remove(p.id)}>Sí</button>
                          <button className="action-btn confirm-no" onClick={() => setDeleteConfirm(null)}>No</button>
                        </div>
                      ) : (
                        <button className="action-btn delete" onClick={() => setDeleteConfirm(p.id)} title="Eliminar">{TrashIcon}</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <h4>Sin productos</h4>
          <p>{activos.length === 0 ? 'Aún no hay productos. Crea el primero.' : 'Ajusta los filtros o crea un nuevo producto.'}</p>
          <button className="admin-btn primary" onClick={openCreate}>+ Nuevo Producto</button>
        </div>
      )}
      </>
      )}

      {wizard && (
        <AdminProductWizard
          initial={wizard}
          avgSales={avgSales}
          avgMargin={avgMargin}
          onClose={() => setWizard(null)}
          onSaved={() => { setWizard(null); load(); }}
        />
      )}
    </div>
  );
}

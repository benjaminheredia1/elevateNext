'use client';

import { useEffect, useMemo, useState } from 'react';
import apiClient from '@/hooks/api';
import {
  foodCostColor, classifyMenu, menuClassMeta, buildablePortions,
} from './inventoryData';
import AdminProductWizard, { type WizardInitial } from './AdminProductWizard';

type Tipo = 'ELABORADO' | 'REVENTA';
type Estado = 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO';

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
const pubBadgeClass: Record<Estado, string> = { PUBLICADO: 'publicado', BORRADOR: 'borrador', ARCHIVADO: 'archivado' };

const EditIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const TrashIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;

export default function AdminProducts() {
  const [productos, setProductos] = useState<ApiProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('Todos');
  const [filterPub, setFilterPub] = useState<string>('todos');
  const [wizard, setWizard] = useState<WizardInitial | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [dbCategorias, setDbCategorias] = useState<string[]>(['Todos']);
  const [actionError, setActionError] = useState('');

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
        setDbCategorias(['Todos', ...cats.map(c => c.nombre)]);
      })
      .catch(() => setDbCategorias(['Todos']));
  }, []);

  const publicados = productos.filter(p => p.estado_publicacion === 'PUBLICADO').length;

  const { avgSales, avgMargin } = useMemo(() => {
    const n = productos.length || 1;
    return {
      avgSales: productos.reduce((s, p) => s + (p.ventas_acumuladas || 0), 0) / n,
      avgMargin: productos.reduce((s, p) => s + (p.precio - (p.costo_calculado || 0)), 0) / n,
    };
  }, [productos]);

  const filtered = productos.filter(p => {
    const ms = p.nombre.toLowerCase().includes(search.toLowerCase());
    const mc = filterCat === 'Todos' || p.categoria_id.some(c => c.categoria?.nombre === filterCat);
    const mp = filterPub === 'todos' || p.estado_publicacion === filterPub;
    return ms && mc && mp;
  });

  const setEstado = async (id: number, estado: Estado) => {
    setActionError('');
    try {
      await apiClient.patch(`/api/admin/productos/${id}`, { estado_publicacion: estado });
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setActionError(err?.response?.data?.error ?? 'No se pudo cambiar el estado. Verifica que tenga receta y foto.');
      setTimeout(() => setActionError(''), 4000);
    }
  };

  const remove = async (id: number) => {
    setActionError('');
    try {
      await apiClient.delete(`/api/admin/productos/${id}`);
      setDeleteConfirm(null);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setDeleteConfirm(null);
      setActionError(err?.response?.data?.error ?? 'No se pudo eliminar. El producto puede tener pedidos asociados.');
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
    estado_publicacion: p.estado_publicacion,
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
          <p>{productos.length} productos · {publicados} publicados</p>
        </div>
        <button className="admin-btn primary" onClick={openCreate}>+ Nuevo Producto</button>
      </div>

      <div className="admin-filters">
        <div className="admin-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="admin-cat-filters">
          {PUB_FILTERS.map(f => (
            <button key={f} className={`cat-filter-btn ${filterPub === f ? 'active' : ''}`} onClick={() => setFilterPub(f)}>{pubLabel[f]}</button>
          ))}
        </div>
      </div>
      <div className="admin-cat-filters" style={{ marginBottom: 20 }}>
        {dbCategorias.map(cat => (
          <button key={cat} className={`cat-filter-btn ${filterCat === cat ? 'active' : ''}`} onClick={() => setFilterCat(cat)}>{cat}</button>
        ))}
      </div>
      {actionError && (
        <div style={{ background: 'rgba(229,72,77,0.12)', border: '1px solid rgba(229,72,77,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 14, color: 'var(--danger)', fontSize: 13 }}>
          ⚠️ {actionError}
        </div>
      )}

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
                        ? <button className="action-btn" onClick={() => setEstado(p.id, 'BORRADOR')} title="Despublicar">⏸</button>
                        : <button className="action-btn" onClick={() => setEstado(p.id, 'PUBLICADO')} title="Publicar" disabled={noRecipe}>▶</button>}
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
          <p>{productos.length === 0 ? 'Aún no hay productos. Crea el primero.' : 'Ajusta los filtros o crea un nuevo producto.'}</p>
          <button className="admin-btn primary" onClick={openCreate}>+ Nuevo Producto</button>
        </div>
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

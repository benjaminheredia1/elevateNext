'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import apiClient from '@/hooks/api';

interface Categoria {
  id: number;
  nombre: string;
  detalles: string | null;
  created_at?: string;
  update_at?: string;
}

interface CategoryForm {
  id?: number;
  nombre: string;
  detalles: string;
}

const EMPTY_FORM: CategoryForm = { nombre: '', detalles: '' };

const EditIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const TrashIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;

function formatDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export default function AdminCategory() {
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/categoria');
      setCategories(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(category =>
      category.nombre.toLowerCase().includes(q)
      || (category.detalles ?? '').toLowerCase().includes(q)
    );
  }, [categories, search]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (category: Categoria) => {
    setForm({ id: category.id, nombre: category.nombre, detalles: category.detalles ?? '' });
    setModalOpen(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      const payload = { nombre: form.nombre.trim(), detalles: form.detalles.trim() };
      if (form.id) {
        await apiClient.put(`/api/categoria/${form.id}`, payload);
      } else {
        await apiClient.post('/api/categoria', payload);
      }
      setModalOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await apiClient.delete(`/api/categoria/${id}`);
      setDeleteConfirm(null);
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="admin-category">
      <div className="admin-page-header">
        <div>
          <h1>Categorías</h1>
          <p>{categories.length} categorías del menú</p>
        </div>
        <button className="admin-btn primary" onClick={openCreate} type="button">+ Nueva categoría</button>
      </div>

      <div className="admin-filters">
        <div className="admin-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar categoría..."
          />
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <h4>Cargando categorías</h4>
          <p>Consultando el catálogo.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h4>Aún no hay categorías</h4>
          <p>{categories.length === 0 ? 'Crea la primera categoría para organizar el menú.' : 'Ajusta la búsqueda para ver más resultados.'}</p>
          {categories.length === 0 && <button className="admin-btn primary" onClick={openCreate} type="button">+ Nueva categoría</button>}
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Descripción</th>
                <th>Creada</th>
                <th>Actualizada</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(category => (
                <tr key={category.id}>
                  <td>
                    <div className="product-cell">
                      <span className="product-cell-name">{category.nombre}</span>
                      <span className="product-cell-desc">ID #{category.id}</span>
                    </div>
                  </td>
                  <td>{category.detalles || '—'}</td>
                  <td>{formatDate(category.created_at)}</td>
                  <td>{formatDate(category.update_at)}</td>
                  <td>
                    <div className="action-btns">
                      <button className="action-btn edit" onClick={() => openEdit(category)} title="Editar" type="button">{EditIcon}</button>
                      {deleteConfirm === category.id ? (
                        <div className="delete-confirm">
                          <button className="action-btn confirm-yes" onClick={() => remove(category.id)} type="button">Sí</button>
                          <button className="action-btn confirm-no" onClick={() => setDeleteConfirm(null)} type="button">No</button>
                        </div>
                      ) : (
                        <button className="action-btn delete" onClick={() => setDeleteConfirm(category.id)} title="Eliminar" type="button">{TrashIcon}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="admin-modal-overlay" onMouseDown={() => setModalOpen(false)}>
          <form className="admin-modal" onSubmit={handleSubmit} onMouseDown={event => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{form.id ? 'Editar categoría' : 'Nueva categoría'}</h3>
              <button className="admin-modal-close" onClick={() => setModalOpen(false)} type="button">×</button>
            </div>
            <div className="admin-modal-body">
              <div className="form-grid">
                <label className="form-group">
                  <span>Nombre</span>
                  <input
                    value={form.nombre}
                    onChange={event => setForm(prev => ({ ...prev, nombre: event.target.value }))}
                    required
                    autoFocus
                  />
                </label>
                <label className="form-group full">
                  <span>Descripción</span>
                  <textarea
                    value={form.detalles}
                    onChange={event => setForm(prev => ({ ...prev, detalles: event.target.value }))}
                    rows={4}
                  />
                </label>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn secondary" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
              <button className="admin-btn primary" disabled={saving || !form.nombre.trim()} type="submit">
                {saving ? 'Guardando...' : 'Guardar categoría'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

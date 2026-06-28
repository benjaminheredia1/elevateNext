'use client';

import { useEffect, useState } from 'react'
import { categories, type AdminProduct, type ProductStatus } from './adminData'

export default function AdminProducts() {
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('Todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<AdminProduct | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/productos')
      .then(r => r.json())
      .then(res => {
        if (res.data) {
          const mapped = res.data.map((p: any) => {
            const catName = p.categoria_id?.[0]?.categoria?.nombre || 'Bowls';
            return {
              id: p.id,
              name: p.nombre,
              description: p.descripcion,
              price: p.precio,
              cost: Math.round(p.precio * 0.4),
              category: catName,
              stock: p.stock || 20,
              status: p.disponible ? 'active' : 'inactive',
              calories: 400,
              protein: '30g',
              sales: 0
            }
          });
          setProducts(mapped)
        }
      })
      .catch(console.error)
  }, [])

  const emptyProduct: AdminProduct = { id: 0, name: '', category: 'Bowls', description: '', price: 0, cost: 0, stock: 0, status: 'active', calories: 0, protein: '0g', sales: 0 }

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCat === 'Todos' || p.category === filterCat
    return matchSearch && matchCat
  })

  const openCreate = () => { setEditProduct({ ...emptyProduct, id: Date.now() }); setModalOpen(true) }
  const openEdit = (p: AdminProduct) => { setEditProduct({ ...p }); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setEditProduct(null) }

  const saveProduct = () => {
    if (!editProduct || !editProduct.name) return
    setProducts(prev => {
      const exists = prev.find(p => p.id === editProduct.id)
      if (exists) return prev.map(p => p.id === editProduct.id ? editProduct : p)
      return [editProduct, ...prev]
    })
    closeModal()
  }

  const deleteProduct = (id: number) => {
    setProducts(prev => prev.filter(p => p.id !== id))
    setDeleteConfirm(null)
  }

  const toggleStatus = (id: number) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status: (p.status === 'active' ? 'inactive' : 'active') as ProductStatus } : p))
  }

  return (
    <div className="admin-products">
      <div className="admin-page-header">
        <div>
          <h1>Productos</h1>
          <p>{products.length} productos registrados</p>
        </div>
        <button className="admin-btn primary" onClick={openCreate}>+ Nuevo Producto</button>
      </div>

      {/* Filters */}
      <div className="admin-filters">
        <div className="admin-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="admin-cat-filters">
          {categories.map(cat => (
            <button key={cat} className={`cat-filter-btn ${filterCat === cat ? 'active' : ''}`} onClick={() => setFilterCat(cat)}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Producto</th><th>Categoría</th><th>Precio</th><th>Costo</th><th>Margen</th><th>Stock</th><th>Ventas</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const margin = Math.round(((p.price - p.cost) / p.price) * 100)
              return (
                <tr key={p.id}>
                  <td>
                    <div className="product-cell">
                      <span className="product-cell-name">{p.name}</span>
                      <span className="product-cell-desc">{p.description.slice(0, 50)}...</span>
                    </div>
                  </td>
                  <td><span className="cat-badge">{p.category}</span></td>
                  <td className="mono">Bs. {p.price}</td>
                  <td className="mono dim">Bs. {p.cost}</td>
                  <td><span className={`margin-badge ${margin >= 60 ? 'high' : margin >= 40 ? 'mid' : 'low'}`}>{margin}%</span></td>
                  <td><span className={`stock-val ${p.stock <= 5 ? 'low' : ''}`}>{p.stock}</span></td>
                  <td className="mono">{p.sales}</td>
                  <td>
                    <button className={`status-toggle ${p.status}`} onClick={() => toggleStatus(p.id)}>
                      <span className="toggle-dot" />
                      {p.status === 'active' ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td>
                    <div className="action-btns">
                      <button className="action-btn edit" onClick={() => openEdit(p)} title="Editar">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      {deleteConfirm === p.id ? (
                        <div className="delete-confirm">
                          <button className="action-btn confirm-yes" onClick={() => deleteProduct(p.id)}>Sí</button>
                          <button className="action-btn confirm-no" onClick={() => setDeleteConfirm(null)}>No</button>
                        </div>
                      ) : (
                        <button className="action-btn delete" onClick={() => setDeleteConfirm(p.id)} title="Eliminar">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && editProduct && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>{editProduct.id === 0 ? 'Nuevo Producto' : 'Editar Producto'}</h2>
              <button className="admin-modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="admin-modal-body">
              <div className="form-grid">
                <div className="form-group full">
                  <label>Nombre</label>
                  <input type="text" value={editProduct.name} onChange={e => setEditProduct({ ...editProduct, name: e.target.value })} placeholder="Nombre del producto" />
                </div>
                <div className="form-group">
                  <label>Categoría</label>
                  <select value={editProduct.category} onChange={e => setEditProduct({ ...editProduct, category: e.target.value })}>
                    {categories.filter(c => c !== 'Todos').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Precio (Bs.)</label>
                  <input type="number" value={editProduct.price} onChange={e => setEditProduct({ ...editProduct, price: +e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Costo (Bs.)</label>
                  <input type="number" value={editProduct.cost} onChange={e => setEditProduct({ ...editProduct, cost: +e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Stock</label>
                  <input type="number" value={editProduct.stock} onChange={e => setEditProduct({ ...editProduct, stock: +e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Calorías</label>
                  <input type="number" value={editProduct.calories} onChange={e => setEditProduct({ ...editProduct, calories: +e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Proteína</label>
                  <input type="text" value={editProduct.protein} onChange={e => setEditProduct({ ...editProduct, protein: e.target.value })} placeholder="Ej: 30g" />
                </div>
                <div className="form-group full">
                  <label>Descripción</label>
                  <textarea value={editProduct.description} onChange={e => setEditProduct({ ...editProduct, description: e.target.value })} rows={3} placeholder="Descripción del producto..." />
                </div>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn secondary" onClick={closeModal}>Cancelar</button>
              <button className="admin-btn primary" onClick={saveProduct}>Guardar Producto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

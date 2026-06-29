'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AdminPanel from '@/components/admin/AdminPanel';
import EmptyState from '@/components/ui/EmptyState';
import MoneyText from '@/components/ui/MoneyText';
import apiClient from '@/hooks/api';

interface Receta {
  id: number;
  nombre: string;
  precio: number;
  costo_calculado: number;
  food_cost_pct: number;
  recetaProducto_id: {
    insumo: { nombre: string; unidad_medida: string; costo_promedio: number };
    cantidad_utilizada: number;
  }[];
}

function FoodCostBadge({ pct }: { pct: number }) {
  const color = pct < 30 ? '#10b981' : pct < 40 ? '#f59e0b' : '#ef4444';
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color, background: `${color}22`, padding: '2px 8px', borderRadius: 6 }}>
      {pct.toFixed(1)}%
    </span>
  );
}

export default function RecetasPage() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: resp, isLoading, isError } = useQuery({
    queryKey: ['admin', 'productos-recetas'],
    queryFn: async () => (await apiClient.get('/api/admin/productos')).data,
  });

  const productos: Receta[] = (resp?.data ?? []).filter((p: Receta) =>
    p.recetaProducto_id?.length > 0 &&
    (!search || p.nombre.toLowerCase().includes(search.toLowerCase()))
  );

  const totalFoodCost = productos.length > 0
    ? productos.reduce((s, p) => s + p.food_cost_pct, 0) / productos.length : 0;

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Recetas & Fichas Técnicas</h1>
          <p>Costo de producción, margen y food cost por producto.</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="dash-card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: 12 }}>Productos con receta</div>
          <div style={{ color: '#fff', fontSize: 28, fontWeight: 800 }}>{productos.length}</div>
        </div>
        <div className="dash-card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: 12 }}>Food cost promedio</div>
          <div style={{ color: totalFoodCost < 30 ? '#10b981' : totalFoodCost < 40 ? '#f59e0b' : '#ef4444', fontSize: 28, fontWeight: 800 }}>{totalFoodCost.toFixed(1)}%</div>
        </div>
        <div className="dash-card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: 12 }}>Food cost ideal</div>
          <div style={{ color: '#10b981', fontSize: 28, fontWeight: 800 }}>&lt;30%</div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <input placeholder="Buscar producto…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 360, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13 }} />
      </div>

      {isLoading ? <EmptyState title="Cargando recetas…" />
        : isError ? <EmptyState title="Error al cargar recetas" />
        : productos.length === 0 ? <EmptyState title="Sin productos con receta registrada" />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {productos.map(p => {
              const margen = p.precio > 0 ? ((p.precio - p.costo_calculado) / p.precio) * 100 : 0;
              const isOpen = expanded === p.id;
              return (
                <div key={p.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
                  {/* Header fila */}
                  <button onClick={() => setExpanded(isOpen ? null : p.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}>
                    <div style={{ flex: 1, color: '#fff', fontWeight: 600, fontSize: 14 }}>{p.nombre}</div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#888', fontSize: 10 }}>Costo</div>
                        <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}><MoneyText value={p.costo_calculado} /></div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#888', fontSize: 10 }}>Precio</div>
                        <div style={{ color: '#ff5c19', fontSize: 13, fontWeight: 700 }}><MoneyText value={p.precio} /></div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#888', fontSize: 10 }}>Margen</div>
                        <div style={{ color: margen >= 60 ? '#10b981' : margen >= 40 ? '#f59e0b' : '#ef4444', fontSize: 13, fontWeight: 700 }}>{margen.toFixed(1)}%</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#888', fontSize: 10 }}>Food Cost</div>
                        <FoodCostBadge pct={p.food_cost_pct} />
                      </div>
                      <span style={{ color: '#555', fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Ingredientes expandidos */}
                  {isOpen && (
                    <div style={{ padding: '0 18px 16px' }}>
                      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                              <th style={{ color: '#666', padding: '8px 12px', textAlign: 'left' }}>Insumo</th>
                              <th style={{ color: '#666', padding: '8px 12px', textAlign: 'right' }}>Cantidad</th>
                              <th style={{ color: '#666', padding: '8px 12px', textAlign: 'right' }}>Costo unit.</th>
                              <th style={{ color: '#666', padding: '8px 12px', textAlign: 'right' }}>Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.recetaProducto_id.map((r, i) => {
                              const subtotal = r.insumo.costo_promedio * r.cantidad_utilizada;
                              return (
                                <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                  <td style={{ color: '#ddd', padding: '8px 12px' }}>{r.insumo.nombre}</td>
                                  <td style={{ color: '#888', padding: '8px 12px', textAlign: 'right' }}>{r.cantidad_utilizada} {r.insumo.unidad_medida}</td>
                                  <td style={{ color: '#888', padding: '8px 12px', textAlign: 'right' }}>Bs {r.insumo.costo_promedio.toFixed(2)}</td>
                                  <td style={{ color: '#fff', padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Bs {subtotal.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                            <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,92,25,0.05)' }}>
                              <td colSpan={3} style={{ color: '#888', padding: '8px 12px', fontWeight: 600 }}>Costo total receta</td>
                              <td style={{ color: '#ff5c19', padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Bs {p.costo_calculado.toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </AdminPanel>
  );
}

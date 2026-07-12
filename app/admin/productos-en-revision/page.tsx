'use client';

import { useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import EmptyState from '@/components/ui/EmptyState';
import { useProductosEnRevision, useResolverProductoEnRevision } from '@/hooks/insumos';

export default function ProductosEnRevisionPage() {
  const { data: productos, isLoading, refetch } = useProductosEnRevision();
  const resolverMutation = useResolverProductoEnRevision();
  const [mensaje, setMensaje] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const handleResolver = async (id: number, nombre: string) => {
    try {
      await resolverMutation.mutateAsync(id);
      setMensaje({
        type: 'ok',
        text: `Producto "${nombre}" resuelto. Vuelve a publicarlo cuando esté listo.`,
      });
      setTimeout(() => setMensaje(null), 4000);
      await refetch();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setMensaje({
        type: 'error',
        text: err?.response?.data?.error ?? 'Error al resolver el producto',
      });
    }
  };

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Productos en Revisión</h1>
          <p>Productos que necesitan ser ajustados debido a cambios en insumos</p>
        </div>
      </div>

      {mensaje && (
        <div
          className="gate-warning"
          style={
            mensaje.type === 'ok'
              ? { background: 'rgba(31,169,113,.12)', borderColor: 'rgba(31,169,113,.35)', color: 'var(--fresh)', marginBottom: 14, cursor: 'pointer' }
              : { marginBottom: 14, cursor: 'pointer' }
          }
          onClick={() => setMensaje(null)}
        >
          {mensaje.text}
        </div>
      )}

      {isLoading ? (
        <div className="empty-state">
          <h4>Cargando...</h4>
        </div>
      ) : !productos || productos.length === 0 ? (
        <EmptyState title="Sin productos en revisión" hint="Los productos que requieran ajustes aparecerán aquí." />
      ) : (
        <div className="dashboard-grid">
          {productos.map((producto) => (
            <div key={producto.id} className="dash-card span-4" style={{ borderLeft: '3px solid var(--amber)' }}>
              <div className="dash-card-header">
                <h3>{producto.nombre}</h3>
                <span className="dash-card-sub" style={{ color: 'var(--amber)', fontWeight: 600 }}>
                  ⚠️ EN REVISIÓN
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                {producto.revision_desde && (
                  <div>
                    <span className="form-hint">Desde:</span>
                    <div style={{ fontSize: 12 }}>
                      {new Date(producto.revision_desde).toLocaleDateString('es-BO', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                )}

                {producto.motivo_revision && (
                  <div>
                    <span className="form-hint">Motivo:</span>
                    <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 4 }}>
                      {producto.motivo_revision}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a
                  href="/admin/products"
                  className="admin-btn primary"
                  style={{ flex: 1, textAlign: 'center' }}
                >
                  ✏ Editar en Productos
                </a>
                <button
                  className="admin-btn secondary"
                  onClick={() => handleResolver(producto.id, producto.nombre)}
                  disabled={resolverMutation.isPending}
                  type="button"
                >
                  {resolverMutation.isPending ? '...' : '✓ Resuelto'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminPanel>
  );
}

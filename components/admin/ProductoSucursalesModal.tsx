'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/hooks/api';
import MoneyText from '@/components/ui/MoneyText';
import EmptyState from '@/components/ui/EmptyState';

interface Fila {
  sucursal_id: number;
  sucursal: string;
  habilitado: boolean;
  precio: number | null;
  disponible: boolean;
  nombre: string | null;
  imagen_url: string | null;
  insumos_receta: number;
}

/**
 * Gestión de un producto en cada sucursal: dónde se vende, a qué precio y con
 * qué presentación. El producto en sí (identidad, categoría) sigue siendo uno
 * solo; al habilitarlo en un local nuevo se copia la receta de otra sucursal
 * como punto de partida y desde ahí es independiente.
 */
export default function ProductoSucursalesModal({ producto, onClose }: {
  producto: { id: number; nombre: string; precio: number };
  onClose: () => void;
}) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState<Record<number, { precio: string; nombre: string }>>({});

  const cargar = async () => {
    try {
      const res = await apiClient.get(`/api/admin/productos/${producto.id}/sucursales`);
      const items: Fila[] = res.data?.items ?? [];
      setFilas(items);
      setBorrador(Object.fromEntries(items.map(f => [
        f.sucursal_id,
        { precio: String(f.precio ?? producto.precio), nombre: f.nombre ?? '' },
      ])));
    } catch {
      setError('No se pudieron cargar las sucursales.');
    }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [producto.id]);

  /** Sucursal de la que copiar la receta: la primera que ya tenga ficha técnica. */
  const origenReceta = filas?.find(f => f.insumos_receta > 0)?.sucursal_id;

  const guardar = async (fila: Fila, cambios: Record<string, unknown> = {}) => {
    setError('');
    setGuardando(fila.sucursal_id);
    const draft = borrador[fila.sucursal_id];
    try {
      await apiClient.post(`/api/admin/productos/${producto.id}/sucursales`, {
        sucursal_id: fila.sucursal_id,
        precio: Number(draft?.precio) > 0 ? Number(draft.precio) : undefined,
        nombre: draft?.nombre.trim() ? draft.nombre.trim() : null,
        ...(fila.habilitado ? {} : { copiar_receta_de: origenReceta }),
        ...cambios,
      });
      await cargar();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setGuardando(null);
    }
  };

  const retirar = async (fila: Fila) => {
    setError('');
    setGuardando(fila.sucursal_id);
    try {
      await apiClient.delete(`/api/admin/productos/${producto.id}/sucursales`, {
        data: { sucursal_id: fila.sucursal_id },
      });
      await cargar();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'No se pudo retirar.');
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal wide" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2>{producto.nombre} por sucursal</h2>
            <p className="form-hint">
              Precio de venta, disponibilidad y presentación de cada local. La receta se copia al habilitar
              y luego es independiente: editarla en una sucursal no afecta a las demás.
            </p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="admin-modal-body">
          {error && <div className="gate-warning" style={{ marginBottom: 12 }}>{error}</div>}
          {!filas ? <EmptyState title="Cargando sucursales…" /> : filas.length === 0 ? (
            <EmptyState title="No hay sucursales activas" />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Sucursal</th>
                  <th>Precio</th>
                  <th>Nombre propio (opcional)</th>
                  <th className="num">Receta</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filas.map(fila => (
                  <tr key={fila.sucursal_id}>
                    <td>
                      <div className="admin-cell-title">{fila.sucursal}</div>
                      <div className="admin-cell-sub">
                        {!fila.habilitado ? 'No habilitado'
                          : fila.disponible ? 'A la venta' : 'Retirado del menú'}
                      </div>
                    </td>
                    <td>
                      <input
                        type="number" step="0.01" min="0" style={{ width: 110 }}
                        value={borrador[fila.sucursal_id]?.precio ?? ''}
                        onChange={e => setBorrador(b => ({
                          ...b,
                          [fila.sucursal_id]: { ...b[fila.sucursal_id], precio: e.target.value },
                        }))}
                      />
                    </td>
                    <td>
                      <input
                        placeholder={producto.nombre}
                        value={borrador[fila.sucursal_id]?.nombre ?? ''}
                        onChange={e => setBorrador(b => ({
                          ...b,
                          [fila.sucursal_id]: { ...b[fila.sucursal_id], nombre: e.target.value },
                        }))}
                      />
                    </td>
                    <td className="num">
                      {fila.insumos_receta > 0
                        ? `${fila.insumos_receta} insumo${fila.insumos_receta === 1 ? '' : 's'}`
                        : <span className="admin-cell-muted">—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        {fila.habilitado ? (
                          <>
                            <button
                              className="admin-btn ghost"
                              disabled={guardando === fila.sucursal_id}
                              onClick={() => guardar(fila)}
                            >
                              Guardar
                            </button>
                            {fila.disponible ? (
                              <button
                                className="admin-btn secondary"
                                disabled={guardando === fila.sucursal_id}
                                onClick={() => retirar(fila)}
                              >
                                Retirar
                              </button>
                            ) : (
                              <button
                                className="admin-btn secondary"
                                disabled={guardando === fila.sucursal_id}
                                onClick={() => guardar(fila, { disponible: true })}
                              >
                                Reactivar
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            className="admin-btn primary"
                            disabled={guardando === fila.sucursal_id}
                            onClick={() => guardar(fila, { disponible: true })}
                          >
                            {guardando === fila.sucursal_id ? 'Habilitando…' : 'Habilitar aquí'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="form-hint" style={{ marginTop: 12 }}>
            Precio de catálogo: <MoneyText value={producto.precio} />. Si dejas el nombre propio vacío
            se usa el del catálogo en todas las sucursales.
          </p>
        </div>

        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

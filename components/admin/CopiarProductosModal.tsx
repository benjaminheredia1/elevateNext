'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/hooks/api';
import { useSucursales } from '@/hooks/sucursales';

interface ProductoOrigen {
  id: number;
  nombre: string;
  precio: number;
  tipo: string;
  estado_publicacion: string;
  en_revision?: boolean;
}

/**
 * Trae productos de otra sucursal al local actual.
 *
 * Existe para que un local nuevo no tenga que recrear el catálogo a mano: eso
 * generaría productos distintos con el mismo nombre, y la analítica los contaría
 * separados, perdiendo la comparación entre locales. Acá el producto es el mismo
 * y solo se le crea su habilitación (precio y receta propias del destino).
 */
export default function CopiarProductosModal({ destino, destinoNombre, onClose, onCopiado }: {
  destino: number;
  destinoNombre: string;
  onClose: () => void;
  onCopiado: (cantidad: number) => void;
}) {
  const { data: sucursales = [] } = useSucursales();
  const otras = useMemo(
    () => sucursales.filter(s => s.id !== destino),
    [sucursales, destino],
  );

  const [origenElegido, setOrigenElegido] = useState<number | null>(null);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [busqueda, setBusqueda] = useState('');
  const [copiarPrecio, setCopiarPrecio] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // La primera sucursal se deriva de la lista en vez de fijarla con un efecto:
  // así no hay un render intermedio sin origen ni cascada de estados.
  const origen = origenElegido ?? otras[0]?.id ?? null;

  // Se piden los dos catálogos: el del origen (lo que se puede traer) y el del
  // destino (para no ofrecer lo que ya está habilitado acá).
  const { data, isLoading: cargando, isError } = useQuery({
    queryKey: ['catalogo-copiar', origen, destino],
    enabled: origen != null,
    queryFn: async () => {
      const [resOrigen, resDestino] = await Promise.all([
        apiClient.get(`/api/admin/productos?sucursal=${origen}`),
        apiClient.get(`/api/admin/productos?sucursal=${destino}`),
      ]);
      const deOrigen: ProductoOrigen[] = resOrigen.data?.data ?? [];
      const deDestino: ProductoOrigen[] = resDestino.data?.data ?? [];
      return {
        items: deOrigen.filter(p => p.estado_publicacion !== 'BAJA'),
        yaTengo: new Set(deDestino.map(p => p.id)),
      };
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  const disponibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const yaTengo = data?.yaTengo ?? new Set<number>();
    return items
      .filter(p => !yaTengo.has(p.id))
      .filter(p => !q || p.nombre.toLowerCase().includes(q));
  }, [items, data, busqueda]);

  const alternar = (id: number) => {
    setElegidos(prev => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const todosElegidos = disponibles.length > 0 && disponibles.every(p => elegidos.has(p.id));

  const copiar = async () => {
    if (origen == null || elegidos.size === 0) return;
    setGuardando(true);
    setError('');
    try {
      const res = await apiClient.post('/api/admin/productos/copiar-sucursal', {
        origen,
        destino,
        productos: Array.from(elegidos),
        copiar_precio: copiarPrecio,
      });
      onCopiado(res.data?.copiados ?? elegidos.size);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'No se pudieron copiar los productos.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2>Agregar productos de otra sucursal</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="admin-modal-body">
          {otras.length === 0 ? (
            <p className="form-hint">No hay otra sucursal de la cual copiar.</p>
          ) : (
            <>
              <div className="form-grid">
                <div className="form-group">
                  <label>Traer desde</label>
                  <select
                    value={origen ?? ''}
                    onChange={e => { setOrigenElegido(Number(e.target.value)); setElegidos(new Set()); }}
                  >
                    {otras.map(s => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Buscar</label>
                  <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre del producto" />
                </div>
              </div>

              <label className="form-check">
                <input type="checkbox" checked={copiarPrecio} onChange={e => setCopiarPrecio(e.target.checked)} />
                <span>Copiar también el precio de {otras.find(s => s.id === origen)?.nombre ?? 'origen'}</span>
              </label>

              <div className="copiar-lista">
                {cargando ? (
                  <p className="form-hint">Cargando catálogo…</p>
                ) : disponibles.length === 0 ? (
                  <p className="form-hint">
                    {items.length === 0
                      ? 'Esa sucursal no tiene productos habilitados.'
                      : `${destinoNombre} ya tiene todos los productos de esa sucursal.`}
                  </p>
                ) : (
                  <>
                    <label className="copiar-fila copiar-fila-todos">
                      <input
                        type="checkbox"
                        checked={todosElegidos}
                        onChange={() => setElegidos(todosElegidos ? new Set() : new Set(disponibles.map(p => p.id)))}
                      />
                      <span>Seleccionar todos ({disponibles.length})</span>
                    </label>
                    {disponibles.map(p => (
                      <label key={p.id} className="copiar-fila">
                        <input type="checkbox" checked={elegidos.has(p.id)} onChange={() => alternar(p.id)} />
                        <span className="copiar-nombre">{p.nombre}</span>
                        <span className="copiar-precio">Bs {p.precio}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>

              <span className="form-hint">
                Se copia la ficha técnica del producto. Después podés cambiarle el precio,
                el nombre para este local o ajustar la receta sin afectar a la otra sucursal.
              </span>
              {(error || isError) && (
                <div className="gate-warning" style={{ marginTop: 12 }}>
                  {error || 'No se pudo cargar el catálogo de esa sucursal.'}
                </div>
              )}
            </>
          )}
        </div>

        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="admin-btn primary"
            onClick={copiar}
            disabled={guardando || elegidos.size === 0}
          >
            {guardando ? 'Copiando…' : `Agregar ${elegidos.size || ''} a ${destinoNombre}`}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/hooks/api';
import { useSucursales } from '@/hooks/sucursales';

interface InsumoOrigen {
  id: number;
  nombre: string;
  unidad_medida: string;
  categoria_insumo?: string | null;
}

/**
 * Trae insumos de otra sucursal al inventario del local actual.
 *
 * Existe por el mismo motivo que su gemelo de productos: recrearlos a mano
 * generaría insumos distintos con el mismo nombre, y el kardex y los costos de
 * receta quedarían partidos entre dos filas. Acá el insumo es el mismo; el
 * local solo empieza a manejarlo, con stock en cero.
 */
export default function CopiarInsumosModal({ destino, destinoNombre, onClose, onCopiado }: {
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
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const origen = origenElegido ?? otras[0]?.id ?? null;

  // Los dos inventarios: el del origen (lo que se puede traer) y el del destino
  // (para no ofrecer lo que este local ya maneja).
  const { data, isLoading: cargando, isError } = useQuery({
    queryKey: ['inventario-copiar', origen, destino],
    enabled: origen != null,
    queryFn: async () => {
      const [resOrigen, resDestino] = await Promise.all([
        apiClient.get(`/api/insumo?sucursal=${origen}`),
        apiClient.get(`/api/insumo?sucursal=${destino}`),
      ]);
      const lista = (r: { data: unknown }): InsumoOrigen[] =>
        Array.isArray(r.data) ? r.data as InsumoOrigen[] : [];
      return {
        items: lista(resOrigen),
        yaTengo: new Set(lista(resDestino).map(i => i.id)),
      };
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  const disponibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const yaTengo = data?.yaTengo ?? new Set<number>();
    return items
      .filter(i => !yaTengo.has(i.id))
      .filter(i => !q || i.nombre.toLowerCase().includes(q));
  }, [items, data, busqueda]);

  const alternar = (id: number) => {
    setElegidos(prev => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const todosElegidos = disponibles.length > 0 && disponibles.every(i => elegidos.has(i.id));

  const copiar = async () => {
    if (origen == null || elegidos.size === 0) return;
    setGuardando(true);
    setError('');
    try {
      const res = await apiClient.post('/api/admin/insumos/copiar-sucursal', {
        origen,
        destino,
        insumos: Array.from(elegidos),
      });
      onCopiado(res.data?.copiados ?? elegidos.size);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'No se pudieron copiar los insumos.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2>Agregar insumos de otra sucursal</h2>
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
                  <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre del insumo" />
                </div>
              </div>

              <div className="copiar-lista">
                {cargando ? (
                  <p className="form-hint">Cargando inventario…</p>
                ) : disponibles.length === 0 ? (
                  <p className="form-hint">
                    {items.length === 0
                      ? 'Esa sucursal no tiene insumos en su inventario.'
                      : `${destinoNombre} ya maneja todos los insumos de esa sucursal.`}
                  </p>
                ) : (
                  <>
                    <label className="copiar-fila copiar-fila-todos">
                      <input
                        type="checkbox"
                        checked={todosElegidos}
                        onChange={() => setElegidos(todosElegidos ? new Set() : new Set(disponibles.map(i => i.id)))}
                      />
                      <span>Seleccionar todos ({disponibles.length})</span>
                    </label>
                    {disponibles.map(i => (
                      <label key={i.id} className="copiar-fila">
                        <input type="checkbox" checked={elegidos.has(i.id)} onChange={() => alternar(i.id)} />
                        <span className="copiar-nombre">{i.nombre}</span>
                        <span className="copiar-precio">{i.unidad_medida}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>

              <span className="form-hint">
                Entran con stock en CERO y los mínimos de la otra sucursal: la mercadería no
                se mueve. Para pasar existencias reales usá una transferencia.
              </span>
              {(error || isError) && (
                <div className="gate-warning" style={{ marginTop: 12 }}>
                  {error || 'No se pudo cargar el inventario de esa sucursal.'}
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

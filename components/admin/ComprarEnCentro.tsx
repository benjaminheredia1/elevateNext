'use client';

import { FormEvent, useState } from 'react';
import { useCompraCentro } from '@/hooks/centro-produccion';

/**
 * Compra de un producto TERMINADO que el Centro no fabrica.
 *
 * Vive suelto porque se abre desde dos lados, y por la misma razón: estos
 * productos no se podían reponer por ningún lado. La compra estaba solo en
 * "Insumo bruto", que los excluye por no ser ingredientes, así que el Centro
 * quedaba con mercadería que podía despachar hasta agotarla y nada más. Ahora
 * se compra tanto desde Producción como desde la fila del producto en el
 * catálogo, que es donde uno lo mira cuando ve que está en cero.
 */
export default function ComprarEnCentro({ centroId, espejoId, nombre, onClose }: {
  centroId: number;
  /** El insumo espejo del producto: sobre él se mueve el stock. */
  espejoId: number;
  nombre: string;
  onClose: () => void;
}) {
  const comprar = useCompraCentro();
  // Una clave por apertura del modal: el reintento manda la misma y el servidor
  // lo rechaza en vez de comprar dos veces y descolocar el costo promedio.
  const [claveIdempotencia] = useState(() => crypto.randomUUID());
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!(Number(cantidad) > 0)) { setError('La cantidad debe ser mayor a cero.'); return; }
    if (!(Number(costo) > 0)) { setError('El costo unitario debe ser mayor a cero.'); return; }
    try {
      await comprar.mutateAsync({
        centro_id: centroId, insumo_id: espejoId,
        cantidad: Number(cantidad), costo_unitario: Number(costo),
        nota: nota || undefined, idempotency_key: claveIdempotencia,
      });
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? 'No se pudo registrar la compra.');
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h3>Comprar — {nombre}</h3>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <p className="form-hint" style={{ marginBottom: 14 }}>
            Este producto el Centro lo compra hecho. Lo que entre acá queda listo para
            despachar a las sucursales.
          </p>
          <div className="form-group">
            <label>Cantidad (unidades)</label>
            <input type="number" step="1" min="0" value={cantidad} onChange={e => setCantidad(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Costo unitario</label>
            <input type="number" step="0.01" min="0" value={costo} onChange={e => setCosto(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Nota (opcional)</label>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Proveedor, factura…" />
          </div>
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={comprar.isPending}>
            {comprar.isPending ? 'Guardando…' : 'Registrar compra'}
          </button>
        </div>
      </form>
    </div>
  );
}

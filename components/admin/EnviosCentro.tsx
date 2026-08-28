'use client';

import { FormEvent, useMemo, useState } from 'react';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import StatusBadge from '@/components/ui/StatusBadge';
import { useSucursales } from '@/hooks/sucursales';
import { useInventarioCentro, type ItemStockCentro } from '@/hooks/centro-produccion';
import {
  useTraslados, useCrearEnvio, useRecibirTraslado, useAnularTraslado,
  type Traslado, type EstadoTraslado,
} from '@/hooks/traslados';

const ESTADO_META: Record<EstadoTraslado, { label: string; status: string }> = {
  EN_TRANSITO: { label: 'En tránsito', status: 'sobrante' },
  RECIBIDO:    { label: 'Recibido',    status: 'abierto' },
  ANULADO:     { label: 'Anulado',     status: 'cerrado' },
};

function mensajeError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error ?? fallback;
}

const valorDeTraslado = (t: Traslado) =>
  t.detalles.reduce((acc, d) => acc + (d.cantidad_recibida ?? d.cantidad_enviada) * d.costo_unitario, 0);

function NuevoEnvioModal({ centroId, onClose }: { centroId: number; onClose: () => void }) {
  const { data: sucursales = [] } = useSucursales();
  const { data: inventario = [] } = useInventarioCentro(centroId);
  const enviar = useCrearEnvio();

  const [claveIdempotencia] = useState(() => crypto.randomUUID());
  const [sucursalId, setSucursalId] = useState('');
  const [lineas, setLineas] = useState<{ insumo_id: string; cantidad: string }[]>([{ insumo_id: '', cantidad: '' }]);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState('');

  const conStock = inventario.filter((i: ItemStockCentro) => i.activo && i.stock_actual > 0);

  const valorEstimado = useMemo(() => lineas.reduce((acc, l) => {
    const item = conStock.find(i => String(i.insumo_id) === l.insumo_id);
    return acc + (item ? item.costo_promedio * Number(l.cantidad || 0) : 0);
  }, 0), [lineas, conStock]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!sucursalId) { setError('Elegí la sucursal destino.'); return; }

    const limpias = lineas
      .filter(l => l.insumo_id && Number(l.cantidad) > 0)
      .map(l => ({ insumo_id: Number(l.insumo_id), cantidad: Number(l.cantidad) }));
    if (limpias.length === 0) { setError('Cargá al menos una línea con cantidad.'); return; }
    if (new Set(limpias.map(l => l.insumo_id)).size !== limpias.length) {
      setError('Hay un insumo repetido en el envío.'); return;
    }

    // El servidor revalida igual; esto es para no hacer viajar un envío que ya
    // se sabe que no entra.
    const excedidas = limpias.filter(l => {
      const item = conStock.find(i => i.insumo_id === l.insumo_id);
      return !item || item.stock_actual < l.cantidad;
    });
    if (excedidas.length > 0) { setError('Alguna línea pide más de lo que hay en el centro.'); return; }

    try {
      await enviar.mutateAsync({
        centro_id: centroId, sucursal_id: Number(sucursalId), lineas: limpias,
        observaciones: observaciones || undefined, idempotency_key: claveIdempotencia,
      });
      onClose();
    } catch (err: unknown) {
      setError(mensajeError(err, 'No se pudo despachar el envío.'));
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h3>Nuevo envío a sucursal</h3>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <p className="form-hint" style={{ marginBottom: 14 }}>
            Al despachar, la mercadería sale del centro y queda <strong>en tránsito</strong>: entra
            al inventario del local recién cuando alguien la recibe ahí.
          </p>

          <div className="form-group">
            <label>Sucursal destino</label>
            <select value={sucursalId} onChange={e => setSucursalId(e.target.value)}>
              <option value="">Elegí…</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>

          {lineas.map((linea, idx) => (
            <div className="form-grid" key={idx} style={{ alignItems: 'end' }}>
              <div className="form-group">
                <label>Producto o insumo</label>
                <select
                  value={linea.insumo_id}
                  onChange={e => setLineas(ls => ls.map((l, i) => i === idx ? { ...l, insumo_id: e.target.value } : l))}
                >
                  <option value="">Elegí…</option>
                  {conStock.map(i => (
                    <option key={i.insumo_id} value={i.insumo_id}>
                      {i.nombre} — hay {i.stock_actual} {i.unidad_medida}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Cantidad</label>
                <input
                  type="number" step="0.01" min="0" value={linea.cantidad}
                  onChange={e => setLineas(ls => ls.map((l, i) => i === idx ? { ...l, cantidad: e.target.value } : l))}
                />
              </div>
              <button
                type="button" className="admin-btn ghost sm"
                onClick={() => setLineas(ls => ls.length === 1 ? ls : ls.filter((_, i) => i !== idx))}
              >
                Quitar
              </button>
            </div>
          ))}

          <button
            type="button" className="admin-btn ghost sm" style={{ marginTop: 6 }}
            onClick={() => setLineas(ls => [...ls, { insumo_id: '', cantidad: '' }])}
          >
            + Agregar línea
          </button>

          {valorEstimado > 0 && (
            <p className="form-hint" style={{ marginTop: 12 }}>
              Valor del despacho: <MoneyText value={valorEstimado} />
            </p>
          )}

          <div className="form-group">
            <label>Observaciones (opcional)</label>
            <input value={observaciones} onChange={e => setObservaciones(e.target.value)} />
          </div>

          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={enviar.isPending}>
            {enviar.isPending ? 'Despachando…' : 'Despachar'}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Recepción. Se muestra también en el admin porque un dueño puede recibir por
 * el cajero, pero el uso normal es desde la pantalla del local.
 */
export function RecibirModal({ traslado, onClose }: { traslado: Traslado; onClose: () => void }) {
  const recibir = useRecibirTraslado();
  const [cantidades, setCantidades] = useState<Record<number, string>>(
    Object.fromEntries(traslado.detalles.map(d => [d.insumo_id, String(d.cantidad_enviada)])),
  );
  const [error, setError] = useState('');

  const faltante = traslado.detalles.reduce((acc, d) => {
    const recibida = Number(cantidades[d.insumo_id] ?? d.cantidad_enviada);
    return acc + Math.max(0, d.cantidad_enviada - recibida) * d.costo_unitario;
  }, 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const recibido = traslado.detalles.map(d => ({
      insumo_id: d.insumo_id,
      cantidad_recibida: Number(cantidades[d.insumo_id] ?? d.cantidad_enviada),
    }));
    if (recibido.some(r => Number.isNaN(r.cantidad_recibida) || r.cantidad_recibida < 0)) {
      setError('Las cantidades recibidas no pueden ser negativas.'); return;
    }
    try {
      await recibir.mutateAsync({ traslado_id: traslado.id, recibido });
      onClose();
    } catch (err: unknown) {
      setError(mensajeError(err, 'No se pudo registrar la recepción.'));
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h3>Recibir envío #{traslado.numero}</h3>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <p className="form-hint" style={{ marginBottom: 14 }}>
            Vienen precargadas las cantidades que salieron del centro. Corregí solo lo que
            llegó distinto: <strong>lo que falte se registra como merma del local</strong>.
          </p>

          {traslado.detalles.map(d => (
            <div className="form-group" key={d.id}>
              <label>{d.insumo.nombre} — salieron {d.cantidad_enviada} {d.insumo.unidad_medida}</label>
              <input
                type="number" step="0.01" min="0" max={d.cantidad_enviada}
                value={cantidades[d.insumo_id] ?? ''}
                onChange={e => setCantidades(c => ({ ...c, [d.insumo_id]: e.target.value }))}
              />
            </div>
          ))}

          {faltante > 0 && (
            <div className="gate-warning" style={{ marginTop: 10 }}>
              Se va a registrar un faltante de <MoneyText value={faltante} /> como merma de la sucursal.
            </div>
          )}
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={recibir.isPending}>
            {recibir.isPending ? 'Recibiendo…' : 'Confirmar recepción'}
          </button>
        </div>
      </form>
    </div>
  );
}

function AnularModal({ traslado, onClose }: { traslado: Traslado; onClose: () => void }) {
  const anular = useAnularTraslado();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!motivo.trim()) { setError('El motivo es obligatorio.'); return; }
    try {
      await anular.mutateAsync({ traslado_id: traslado.id, motivo: motivo.trim() });
      onClose();
    } catch (err: unknown) {
      setError(mensajeError(err, 'No se pudo anular el envío.'));
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h3>Anular envío #{traslado.numero}</h3>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <p className="form-hint" style={{ marginBottom: 14 }}>
            La mercadería vuelve al inventario del centro con el mismo costo con el que salió.
          </p>
          <div className="form-group">
            <label>Motivo</label>
            <input value={motivo} onChange={e => setMotivo(e.target.value)} />
          </div>
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={anular.isPending}>
            {anular.isPending ? 'Anulando…' : 'Anular'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function EnviosCentro({ centroId }: { centroId: number }) {
  const { data, isLoading } = useTraslados({ centroId });
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [recibiendo, setRecibiendo] = useState<Traslado | null>(null);
  const [anulando, setAnulando] = useState<Traslado | null>(null);

  const traslados = data?.items ?? [];

  return (
    <>
      <div className="kpi-grid">
        <KpiCard label="En tránsito" value={<MoneyText value={data?.valor_en_transito ?? 0} />} />
        <KpiCard
          label="Envíos sin recibir"
          value={String(traslados.filter(t => t.estado === 'EN_TRANSITO').length)}
        />
      </div>

      <div className="admin-toolbar" style={{ marginBottom: 16 }}>
        <button className="admin-btn primary" onClick={() => setNuevoAbierto(true)}>Nuevo envío</button>
      </div>

      {nuevoAbierto && <NuevoEnvioModal centroId={centroId} onClose={() => setNuevoAbierto(false)} />}
      {recibiendo && <RecibirModal traslado={recibiendo} onClose={() => setRecibiendo(null)} />}
      {anulando && <AnularModal traslado={anulando} onClose={() => setAnulando(null)} />}

      {isLoading ? (
        <EmptyState title="Cargando envíos…" />
      ) : traslados.length === 0 ? (
        <EmptyState
          title="Todavía no se despachó nada"
          hint="Los envíos que salgan de este centro van a aparecer acá hasta que el local los reciba."
        />
      ) : (
        <DataTable
          data={traslados}
          rowKey={(row: Traslado) => row.id}
          columns={[
            { key: 'numero', header: 'Envío', render: (row: Traslado) => (
              <div>
                <div className="admin-cell-title">#{row.numero} — {row.sucursal.nombre}</div>
                <div className="admin-cell-sub">
                  {row.detalles.map(d => `${d.insumo.nombre} ×${d.cantidad_enviada}`).join(' · ')}
                </div>
              </div>
            )},
            { key: 'estado', header: 'Estado', render: (row: Traslado) => (
              <StatusBadge status={ESTADO_META[row.estado].status} label={ESTADO_META[row.estado].label} />
            )},
            { key: 'fecha', header: 'Despachado', render: (row: Traslado) =>
              new Date(row.fecha_envio).toLocaleDateString('es-BO') },
            { key: 'valor', header: 'Valor', className: 'num',
              render: (row: Traslado) => <MoneyText value={valorDeTraslado(row)} /> },
            { key: 'acciones', header: '', render: (row: Traslado) => (
              row.estado === 'EN_TRANSITO' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="admin-btn ghost sm" onClick={() => setRecibiendo(row)}>Recibir</button>
                  <button className="admin-btn ghost sm" onClick={() => setAnulando(row)}>Anular</button>
                </div>
              ) : null
            )},
          ]}
        />
      )}
    </>
  );
}

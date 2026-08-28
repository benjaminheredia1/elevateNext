'use client';

import { FormEvent, useEffect, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  useCentrosProduccion, useCrearCentro, useInventarioCentro, useAltaInsumoCentro,
  useCompraCentro, useMermaCentro, useConteoCentro, useBajaInsumoCentro, useReactivarInsumoCentro,
  useEditarUmbralesCentro,
  type ItemStockCentro,
} from '@/hooks/centro-produccion';

const NIVEL_META: Record<ItemStockCentro['nivel'], { label: string; status: string }> = {
  ok:      { label: 'OK',      status: 'abierto' },
  bajo:    { label: 'Bajo',    status: 'sobrante' },
  critico: { label: 'Crítico', status: 'faltante' },
  baja:    { label: 'De baja', status: 'cerrado' },
};

function CrearCentroModal({ onClose }: { onClose: () => void }) {
  const crear = useCrearCentro();
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (nombre.trim().length < 2) { setError('El nombre es obligatorio.'); return; }
    try {
      await crear.mutateAsync({ nombre: nombre.trim(), direccion: direccion.trim() || undefined });
      onClose();
    } catch (e: unknown) {
      setError(mensajeError(e, 'No se pudo crear el centro.'));
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h2>Nuevo centro de producción</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <div className="form-group">
            <label>Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Centro de Producción" />
          </div>
          <div className="form-group">
            <label>Dirección (opcional)</label>
            <input value={direccion} onChange={e => setDireccion(e.target.value)} />
          </div>
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={crear.isPending}>
            {crear.isPending ? 'Creando…' : 'Crear centro'}
          </button>
        </div>
      </form>
    </div>
  );
}

function AltaInsumoModal({ centroId, onClose }: { centroId: number; onClose: () => void }) {
  const alta = useAltaInsumoCentro(centroId);
  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState('UNIDAD');
  const [stockInicial, setStockInicial] = useState('');
  const [costo, setCosto] = useState('');
  const [minimo, setMinimo] = useState('');
  const [critico, setCritico] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (nombre.trim().length < 1) { setError('El nombre es obligatorio.'); return; }
    try {
      await alta.mutateAsync({
        nombre: nombre.trim(), unidad_medida: unidad,
        stock_inicial: Number(stockInicial) || 0, costo_unitario: Number(costo) || 0,
        stock_minimo: Number(minimo) || 0, punto_critico: Number(critico) || 0,
      });
      onClose();
    } catch (e: unknown) {
      setError(mensajeError(e, 'No se pudo dar de alta el insumo.'));
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h2>Nuevo insumo en el centro</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <div className="form-group">
            <label>Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Fideo" />
          </div>
          <div className="form-group">
            <label>Unidad de medida</label>
            <select value={unidad} onChange={e => setUnidad(e.target.value)}>
              {['KG', 'GR', 'UNIDAD', 'LT', 'ML'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Stock inicial</label>
            <input type="number" step="0.01" min="0" value={stockInicial} onChange={e => setStockInicial(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Costo unitario</label>
            <input type="number" step="0.01" min="0" value={costo} onChange={e => setCosto(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Stock mínimo</label>
            <input type="number" step="0.01" min="0" value={minimo} onChange={e => setMinimo(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Punto crítico</label>
            <input type="number" step="0.01" min="0" value={critico} onChange={e => setCritico(e.target.value)} />
          </div>
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={alta.isPending}>
            {alta.isPending ? 'Guardando…' : 'Dar de alta'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Mismo patrón que `errorMsg` en components/admin/: el error de axios llega
// como `unknown` y lo que le sirve al operador es el mensaje del backend.
function mensajeError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error ?? fallback;
}

type AccionRapida = 'compra' | 'merma' | 'conteo' | 'baja' | 'umbrales';

function AccionModal({ centroId, item, accion, onClose }: {
  centroId: number; item: ItemStockCentro; accion: AccionRapida; onClose: () => void;
}) {
  const compra = useCompraCentro();
  const merma = useMermaCentro();
  const conteo = useConteoCentro();
  const baja = useBajaInsumoCentro();
  const umbrales = useEditarUmbralesCentro();
  // Clave de idempotencia de ESTE intento del operador. Se genera una sola vez,
  // al montarse el modal, y se reusa en cada reenvío: es lo que le permite al
  // servidor distinguir un reintento (doble clic, respuesta perdida) de una
  // segunda compra genuina. Generarla dentro del submit anularía la protección.
  const [claveIdempotencia] = useState(() => crypto.randomUUID());
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [texto, setTexto] = useState('');
  // Los umbrales se precargan con los valores actuales de la fila, no vacíos:
  // el operador está corrigiendo un valor existente, no cargando uno nuevo.
  const [stockMinimo, setStockMinimo] = useState(String(item.stock_minimo));
  const [puntoCritico, setPuntoCritico] = useState(String(item.punto_critico));
  const [error, setError] = useState('');

  const titulos: Record<AccionRapida, string> = {
    compra: `Compra — ${item.nombre}`,
    merma: `Merma — ${item.nombre}`,
    conteo: `Conteo físico — ${item.nombre}`,
    baja: `Dar de baja — ${item.nombre}`,
    umbrales: `Umbrales de alerta — ${item.nombre}`,
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (accion === 'compra') {
        if (!(Number(cantidad) > 0) || !(Number(costo) > 0)) { setError('Cantidad y costo deben ser mayores a cero.'); return; }
        await compra.mutateAsync({ centro_id: centroId, insumo_id: item.insumo_id, cantidad: Number(cantidad), costo_unitario: Number(costo), nota: texto || undefined, idempotency_key: claveIdempotencia });
      } else if (accion === 'merma') {
        if (!(Number(cantidad) > 0) || !texto.trim()) { setError('Cantidad y descripción son obligatorias.'); return; }
        await merma.mutateAsync({ centro_id: centroId, insumo_id: item.insumo_id, cantidad: Number(cantidad), descripcion: texto, idempotency_key: claveIdempotencia });
      } else if (accion === 'conteo') {
        if (cantidad === '' || Number(cantidad) < 0) { setError('Indicá el nuevo stock.'); return; }
        await conteo.mutateAsync({ centro_id: centroId, insumo_id: item.insumo_id, nuevo_stock: Number(cantidad), descripcion: texto || undefined });
      } else if (accion === 'umbrales') {
        if (stockMinimo === '' || puntoCritico === '' || Number(stockMinimo) < 0 || Number(puntoCritico) < 0) {
          setError('Indicá el stock mínimo y el punto crítico.'); return;
        }
        await umbrales.mutateAsync({ centro_id: centroId, insumo_id: item.insumo_id, stock_minimo: Number(stockMinimo), punto_critico: Number(puntoCritico) });
      } else {
        if (!texto.trim()) { setError('El motivo es obligatorio.'); return; }
        await baja.mutateAsync({ centro_id: centroId, insumo_id: item.insumo_id, motivo: texto });
      }
      onClose();
    } catch (e: unknown) {
      setError(mensajeError(e, 'No se pudo completar la acción.'));
    }
  };

  const enviando = compra.isPending || merma.isPending || conteo.isPending || baja.isPending || umbrales.isPending;

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h2>{titulos[accion]}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          {accion !== 'baja' && accion !== 'umbrales' && (
            <div className="form-group">
              <label>{accion === 'conteo' ? `Nuevo stock (${item.unidad_medida})` : `Cantidad (${item.unidad_medida})`}</label>
              <input type="number" step="0.01" min="0" value={cantidad} onChange={e => setCantidad(e.target.value)} />
            </div>
          )}
          {accion === 'compra' && (
            <div className="form-group">
              <label>Costo unitario</label>
              <input type="number" step="0.01" min="0" value={costo} onChange={e => setCosto(e.target.value)} />
            </div>
          )}
          {(accion === 'merma' || accion === 'baja') && (
            <div className="form-group">
              <label>{accion === 'baja' ? 'Motivo' : 'Descripción'}</label>
              <input value={texto} onChange={e => setTexto(e.target.value)} />
            </div>
          )}
          {(accion === 'compra' || accion === 'conteo') && (
            <div className="form-group">
              <label>Nota (opcional)</label>
              <input value={texto} onChange={e => setTexto(e.target.value)} />
            </div>
          )}
          {accion === 'umbrales' && (
            <>
              <p className="form-hint" style={{ marginBottom: 14 }}>
                Cuando el stock baje del mínimo se marca Bajo; del punto crítico, Crítico.
              </p>
              <div className="form-group">
                <label>Stock mínimo ({item.unidad_medida})</label>
                <input type="number" step="0.01" min="0" value={stockMinimo} onChange={e => setStockMinimo(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Punto crítico ({item.unidad_medida})</label>
                <input type="number" step="0.01" min="0" value={puntoCritico} onChange={e => setPuntoCritico(e.target.value)} />
              </div>
            </>
          )}
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CentroProduccionPage() {
  const { data: centros = [] } = useCentrosProduccion();
  const [centroId, setCentroId] = useState<number | null>(null);
  const [crearCentroAbierto, setCrearCentroAbierto] = useState(false);
  const [altaInsumoAbierto, setAltaInsumoAbierto] = useState(false);
  const [accion, setAccion] = useState<{ item: ItemStockCentro; tipo: AccionRapida } | null>(null);
  const [error, setError] = useState('');
  const reactivar = useReactivarInsumoCentro();

  const intentarReactivar = async (insumoId: number) => {
    if (centroId == null) return;
    setError('');
    try {
      await reactivar.mutateAsync({ centro_id: centroId, insumo_id: insumoId });
    } catch (e: unknown) {
      setError(mensajeError(e, 'No se pudo reactivar el insumo.'));
    }
  };

  useEffect(() => {
    if (centroId == null && centros.length > 0) setCentroId(centros[0].id);
  }, [centros, centroId]);

  const { data: items = [], isLoading } = useInventarioCentro(centroId);

  const valorizado = items.reduce((acc, i) => acc + i.stock_actual * i.costo_promedio, 0);
  const criticos = items.filter(i => i.nivel === 'critico').length;
  const bajos = items.filter(i => i.nivel === 'bajo').length;

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Centro de Producción</h1>
          <p>Insumo bruto del centro: stock, costo y alertas.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          {centros.length > 0 && (
            <label className="sucursal-selector">
              <span>Centro</span>
              <select value={centroId ?? ''} onChange={e => setCentroId(e.target.value ? Number(e.target.value) : null)}>
                {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
          )}
          <button className="admin-btn ghost" onClick={() => setCrearCentroAbierto(true)}>
            + Nuevo centro
          </button>
          {centroId != null && (
            <button className="admin-btn primary" onClick={() => setAltaInsumoAbierto(true)}>
              + Nuevo insumo
            </button>
          )}
        </div>
      </div>

      {crearCentroAbierto && <CrearCentroModal onClose={() => setCrearCentroAbierto(false)} />}
      {altaInsumoAbierto && centroId != null && (
        <AltaInsumoModal centroId={centroId} onClose={() => setAltaInsumoAbierto(false)} />
      )}
      {accion && centroId != null && (
        <AccionModal centroId={centroId} item={accion.item} accion={accion.tipo} onClose={() => setAccion(null)} />
      )}

      {error && <div className="gate-warning" style={{ marginBottom: 12 }}>{error}</div>}

      {centros.length === 0 ? (
        <EmptyState title="Todavía no hay ningún centro de producción" hint="Creá el primero para empezar a cargarle insumo bruto." />
      ) : centroId == null || isLoading ? (
        <EmptyState title="Cargando inventario…" />
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Insumos en el centro" value={items.length} />
            <KpiCard label="Inventario valorizado" value={<MoneyText value={valorizado} />} highlight />
            <KpiCard label="Stock bajo" value={bajos} accent="var(--amber)" />
            <KpiCard label="Crítico" value={criticos} accent="var(--danger)" />
          </div>

          <DataTable
            data={items}
            emptyTitle="Este centro todavía no tiene insumo cargado"
            rowKey={(row: ItemStockCentro) => row.insumo_id}
            columns={[
              { key: 'nombre', header: 'Insumo', render: (row: ItemStockCentro) => (
                <div>
                  <div className="admin-cell-title">{row.nombre}</div>
                  {row.proveedor && <div className="admin-cell-sub">{row.proveedor}</div>}
                </div>
              )},
              { key: 'stock', header: 'Stock', className: 'num', render: (row: ItemStockCentro) => `${row.stock_actual} ${row.unidad_medida}` },
              { key: 'nivel', header: 'Estado', render: (row: ItemStockCentro) => (
                <StatusBadge status={NIVEL_META[row.nivel].status} label={NIVEL_META[row.nivel].label} />
              )},
              { key: 'minimo', header: 'Mínimo', className: 'num', render: (row: ItemStockCentro) => row.stock_minimo },
              { key: 'costo', header: 'Costo prom.', className: 'num', render: (row: ItemStockCentro) => <MoneyText value={row.costo_promedio} /> },
              { key: 'valor', header: 'Valorizado', className: 'num', render: (row: ItemStockCentro) => <MoneyText value={row.stock_actual * row.costo_promedio} /> },
              { key: 'acciones', header: '', render: (row: ItemStockCentro) => (
                row.activo ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="admin-btn ghost sm" onClick={() => setAccion({ item: row, tipo: 'compra' })}>Compra</button>
                    <button className="admin-btn ghost sm" onClick={() => setAccion({ item: row, tipo: 'merma' })}>Merma</button>
                    <button className="admin-btn ghost sm" onClick={() => setAccion({ item: row, tipo: 'conteo' })}>Conteo</button>
                    <button className="admin-btn ghost sm" onClick={() => setAccion({ item: row, tipo: 'umbrales' })}>Umbrales</button>
                    <button className="admin-btn ghost sm" onClick={() => setAccion({ item: row, tipo: 'baja' })}>Dar de baja</button>
                  </div>
                ) : (
                  <button
                    className="admin-btn ghost sm"
                    onClick={() => intentarReactivar(row.insumo_id)}
                    disabled={reactivar.isPending}
                  >
                    Reactivar
                  </button>
                )
              )},
            ]}
          />
        </>
      )}
    </AdminPanel>
  );
}

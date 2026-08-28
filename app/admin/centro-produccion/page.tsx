'use client';

import { FormEvent, useEffect, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import EmptyState from '@/components/ui/EmptyState';
import ProduccionCentro from '@/components/admin/ProduccionCentro';
import EnviosCentro from '@/components/admin/EnviosCentro';
import NucleoInventario from '@/components/admin/inventario/NucleoInventario';
import { AMBITO_CENTRO } from '@/components/admin/inventario/ambitos';
import { stockState, type Insumo } from '@/components/admin/inventario/comunes';
import {
  useCentrosProduccion, useCrearCentro, useAltaInsumoCentro,
  useBajaInsumoCentro, useReactivarInsumoCentro, useEditarUmbralesCentro,
} from '@/hooks/centro-produccion';

/**
 * Marco del inventario del Centro de Producción. La tabla de insumo bruto, sus
 * modales de compra, merma y conteo y el kardex viven en `NucleoInventario`,
 * el mismo componente que usa la sucursal. Acá queda lo que es del Centro y
 * solo de él: el selector de centro, el alta de insumo, los umbrales de alerta,
 * la baja y reactivación en el centro, y las pestañas de producción y envíos.
 */

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

/**
 * Compra, merma y conteo NO están acá: los provee el núcleo compartido, con su
 * propia clave de idempotencia. Quedan las dos acciones que son del Centro y
 * que el núcleo no conoce.
 */
type AccionRapida = 'baja' | 'umbrales';

function AccionModal({ centroId, item, accion, onClose }: {
  centroId: number; item: Insumo; accion: AccionRapida; onClose: () => void;
}) {
  const baja = useBajaInsumoCentro();
  const umbrales = useEditarUmbralesCentro();
  const [texto, setTexto] = useState('');
  // Los umbrales se precargan con los valores actuales de la fila, no vacíos:
  // el operador está corrigiendo un valor existente, no cargando uno nuevo.
  const [stockMinimo, setStockMinimo] = useState(String(item.stock_minimo));
  const [puntoCritico, setPuntoCritico] = useState(String(item.punto_critico));
  const [error, setError] = useState('');

  const titulos: Record<AccionRapida, string> = {
    baja: `Dar de baja — ${item.nombre}`,
    umbrales: `Umbrales de alerta — ${item.nombre}`,
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (accion === 'umbrales') {
        if (stockMinimo === '' || puntoCritico === '' || Number(stockMinimo) < 0 || Number(puntoCritico) < 0) {
          setError('Indicá el stock mínimo y el punto crítico.'); return;
        }
        await umbrales.mutateAsync({ centro_id: centroId, insumo_id: item.id, stock_minimo: Number(stockMinimo), punto_critico: Number(puntoCritico) });
      } else {
        if (!texto.trim()) { setError('El motivo es obligatorio.'); return; }
        await baja.mutateAsync({ centro_id: centroId, insumo_id: item.id, motivo: texto });
      }
      onClose();
    } catch (e: unknown) {
      setError(mensajeError(e, 'No se pudo completar la acción.'));
    }
  };

  const enviando = baja.isPending || umbrales.isPending;

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h2>{titulos[accion]}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          {accion === 'baja' && (
            <div className="form-group">
              <label>Motivo</label>
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

type Pestana = 'inventario' | 'movimientos' | 'produccion' | 'envios';

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'inventario',  label: 'Insumo bruto' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'produccion',  label: 'Producción' },
  { id: 'envios',      label: 'Envíos a sucursal' },
];

export default function CentroProduccionPage() {
  const { data: centros = [] } = useCentrosProduccion();
  const [centroId, setCentroId] = useState<number | null>(null);
  const [crearCentroAbierto, setCrearCentroAbierto] = useState(false);
  const [altaInsumoAbierto, setAltaInsumoAbierto] = useState(false);
  const [accion, setAccion] = useState<{ item: Insumo; tipo: AccionRapida } | null>(null);
  const [tab, setTab] = useState<Pestana>('inventario');
  const [error, setError] = useState('');
  // El núcleo trae su propia lista por axios; los KPI se arman con esa misma
  // data en vez de pedirla otra vez, así no pueden discrepar con la tabla.
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  // El núcleo no está en React Query: lo que se opera desde el marco (alta,
  // umbrales, baja, reactivación) no invalida su carga, así que se le avisa
  // subiendo este contador.
  const [refresco, setRefresco] = useState(0);
  const reactivar = useReactivarInsumoCentro();

  const intentarReactivar = async (insumoId: number) => {
    if (centroId == null) return;
    setError('');
    try {
      await reactivar.mutateAsync({ centro_id: centroId, insumo_id: insumoId });
      setRefresco(r => r + 1);
    } catch (e: unknown) {
      setError(mensajeError(e, 'No se pudo reactivar el insumo.'));
    }
  };

  const cerrarAccion = () => { setAccion(null); setRefresco(r => r + 1); };

  useEffect(() => {
    if (centroId == null && centros.length > 0) setCentroId(centros[0].id);
  }, [centros, centroId]);

  // Solo los activos cuentan para el valor del inventario: una fila dada de
  // baja en el centro sigue listada para poder reactivarla, pero su stock ya
  // no es mercadería del centro.
  const activos = insumos.filter(i => i.activo);
  const valorizado = activos.reduce((acc, i) => acc + i.stock_actual * i.costo_promedio, 0);
  const criticos = activos.filter(i => stockState(i) === 'critico' || stockState(i) === 'agotado').length;
  const bajos = activos.filter(i => stockState(i) === 'bajo').length;

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Centro de Producción</h1>
          <p>Compra de insumo bruto, producción de terminados y despacho a las sucursales.</p>
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
          {centroId != null && tab === 'inventario' && (
            <button className="admin-btn primary" onClick={() => setAltaInsumoAbierto(true)}>
              + Nuevo insumo
            </button>
          )}
        </div>
      </div>

      {crearCentroAbierto && <CrearCentroModal onClose={() => setCrearCentroAbierto(false)} />}
      {altaInsumoAbierto && centroId != null && (
        <AltaInsumoModal
          centroId={centroId}
          onClose={() => { setAltaInsumoAbierto(false); setRefresco(r => r + 1); }}
        />
      )}
      {accion && centroId != null && (
        <AccionModal centroId={centroId} item={accion.item} accion={accion.tipo} onClose={cerrarAccion} />
      )}

      {error && <div className="gate-warning" style={{ marginBottom: 12 }}>{error}</div>}

      {centros.length > 0 && centroId != null && (
        <div className="admin-tabs">
          {PESTANAS.map(p => (
            <button
              key={p.id}
              className={`admin-tab${tab === p.id ? ' active' : ''}`}
              onClick={() => setTab(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {centros.length === 0 ? (
        <EmptyState title="Todavía no hay ningún centro de producción" hint="Creá el primero para empezar a cargarle insumo bruto." />
      ) : centroId == null ? (
        <EmptyState title="Cargando inventario…" />
      ) : (
        <>
          {tab === 'produccion' && <ProduccionCentro centroId={centroId} />}
          {tab === 'envios' && <EnviosCentro centroId={centroId} />}

          {tab === 'inventario' && (
            <div className="kpi-grid">
              <KpiCard label="Insumos en el centro" value={activos.length} />
              <KpiCard label="Inventario valorizado" value={<MoneyText value={valorizado} />} highlight />
              <KpiCard label="Stock bajo" value={bajos} accent="var(--amber)" />
              <KpiCard label="Crítico" value={criticos} accent="var(--danger)" />
            </div>
          )}

          {/* El núcleo se monta siempre: pasar por Producción o Envíos no puede
              costar una recarga del inventario ni perder el filtro escrito. */}
          <NucleoInventario
            ambito={AMBITO_CENTRO}
            contextoId={centroId}
            vista={tab === 'inventario' ? 'insumos' : tab === 'movimientos' ? 'movimientos' : 'oculto'}
            onInsumos={setInsumos}
            refresco={refresco}
            mensajeSinInsumos="Este centro todavía no tiene insumo bruto cargado."
            accionSinInsumos={
              <button className="admin-btn primary" onClick={() => setAltaInsumoAbierto(true)} type="button">
                + Nuevo insumo
              </button>
            }
            accionesFicha={insumo => (
              <button
                className="action-btn edit"
                title="Umbrales de alerta (mínimo y punto crítico)"
                onClick={() => setAccion({ item: insumo, tipo: 'umbrales' })}
                type="button"
              >⚑</button>
            )}
            accionesAlcance={insumo => (
              <button
                className="action-btn delete"
                title="Dar de baja en este centro (el insumo sigue en el catálogo del negocio)"
                onClick={() => setAccion({ item: insumo, tipo: 'baja' })}
                type="button"
              >⛔</button>
            )}
            accionesInactivo={insumo => (
              <button
                className="action-btn edit"
                title="Reactivar en este centro"
                onClick={() => intentarReactivar(insumo.id)}
                disabled={reactivar.isPending}
                type="button"
              >↩</button>
            )}
          />
        </>
      )}

    </AdminPanel>
  );
}

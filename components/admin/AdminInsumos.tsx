'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '@/hooks/api';
import { useDarDeBajaInsumo, useReactivarInsumo, type ResultadoBajaInsumo, type ResultadoReactivarInsumo } from '@/hooks/insumos';
import SucursalSelector from '@/components/ui/SucursalSelector';
import CopiarInsumosModal from '@/components/admin/CopiarInsumosModal';
import { useSucursales } from '@/hooks/sucursales';
import { useSucursalAdmin } from '@/hooks/sucursal-admin';
import NucleoInventario from '@/components/admin/inventario/NucleoInventario';
import { AMBITO_SUCURSAL } from '@/components/admin/inventario/ambitos';
import {
  CostoAyuda,
  UnidadFieldGroup,
  errorMsg,
  medidaInfo,
  money,
  number,
  stockState,
  type EstadoStock,
  type Insumo,
  type UnidadMedidaRow,
} from '@/components/admin/inventario/comunes';

/**
 * Marco del inventario de sucursal. La tabla de stock, sus modales de compra,
 * merma y conteo y el kardex viven en `NucleoInventario`, compartidos con el
 * Centro de Producción. Acá queda lo que es de la sucursal y solo de ella: el
 * selector de local, el consolidado del negocio, copiar insumos de otra
 * sucursal, la ficha del insumo, la baja y la reactivación por local, y las
 * pestañas de recetas y unidades.
 */

type Tab = 'insumos' | 'movimientos' | 'recetas' | 'unidades';
type ModalAction = 'crear' | 'editar' | 'baja' | null;

interface Receta {
  id: number;
  producto_id: number;
  insumo_id: number;
  cantidad_utilizada: number;
  producto: { id: number; nombre: string; precio?: number };
  insumo: { id: number; nombre: string; unidad_medida: string; costo_promedio: number; stock_actual: number };
}

interface FormState {
  categoria_insumo: string;
  costo_promedio: string;
  descripcion: string;
  equivalencia_cantidad: string;
  equivalencia_unidad: string;
  nombre: string;
  proveedor: string;
  punto_critico: string;
  stock_actual: string;
  stock_minimo: string;
  unidad_medida: string;
}

const EMPTY_FORM: FormState = {
  categoria_insumo: '',
  costo_promedio: '',
  descripcion: '',
  equivalencia_cantidad: '',
  equivalencia_unidad: '',
  nombre: '',
  proveedor: '',
  punto_critico: '',
  stock_actual: '',
  stock_minimo: '',
  unidad_medida: 'KG',
};

export default function AdminInsumos({ readOnly = false }: { readOnly?: boolean }) {
  const [tab, setTab] = useState<Tab>('insumos');
  // Local cuyo stock se está viendo y operando. Sin sucursal elegida se muestra
  // el agregado del negocio, que es el comportamiento previo a multi-sucursal.
  // Sale del store del panel: es la misma que muestra la barra lateral.
  const { sucursal, setSucursal, listo } = useSucursalAdmin();
  // Sin sucursal elegida se ve la suma de todos los locales: el stock total es
  // un dato válido, pero el estado (OK/Bajo/Crítico) sobre esa suma no lo es.
  const consolidado = !sucursal;
  // Copia de la lista que cargó el núcleo. El marco no la vuelve a pedir: la
  // recibe para armar los KPIs de cabecera con exactamente los mismos datos
  // que muestra la tabla.
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [selected, setSelected] = useState<Insumo | null>(null);
  const [modalAction, setModalAction] = useState<ModalAction>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [pageMsg, setPageMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [unidades, setUnidades] = useState<UnidadMedidaRow[]>([]);
  const [unidadModal, setUnidadModal] = useState<'crear' | 'editar' | null>(null);
  const [selectedUnidad, setSelectedUnidad] = useState<UnidadMedidaRow | null>(null);
  const [unidadForm, setUnidadForm] = useState<{ nombre: string; activo: boolean }>({ nombre: '', activo: true });
  const [unidadSaving, setUnidadSaving] = useState(false);
  const [unidadError, setUnidadError] = useState('');
  const [resultadoBaja, setResultadoBaja] = useState<ResultadoBajaInsumo | null>(null);
  const [, setResultadoReactivar] = useState<ResultadoReactivarInsumo | null>(null);
  const [copiarAbierto, setCopiarAbierto] = useState(false);
  // Se incrementa para que el núcleo vuelva a pedir su lista cuando el marco
  // tocó el inventario desde afuera (alta, baja, reactivación, copia).
  const [refresco, setRefresco] = useState(0);
  const { data: sucursales = [] } = useSucursales();
  const nombreSucursal = useMemo(
    () => (sucursal ? sucursales.find(s => s.id === Number(sucursal))?.nombre : undefined),
    [sucursales, sucursal],
  );
  // Confirmación de "quitar del inventario de este local" (no borra el insumo).
  const [quitarConfirm, setQuitarConfirm] = useState<number | null>(null);
  const darDeBaja = useDarDeBajaInsumo();
  const reactivar = useReactivarInsumo();

  /**
   * Datos que son del marco: las recetas y el catálogo de unidades.
   *
   * Va aparte de la carga del núcleo a propósito. Antes del refactor las cuatro
   * peticiones compartían un `Promise.all` y un `catch`, así que un fallo de
   * `/api/recetas` —una pestaña secundaria— vaciaba también la tabla de stock.
   * Ahora cada mitad falla sola: que se caiga el catálogo de recetas no puede
   * dejar al usuario sin ver su inventario, que es a lo que entró.
   */
  const loadMarco = useCallback(async () => {
    try {
      const [recetasRes, unidadesRes] = await Promise.all([
        apiClient.get('/api/recetas'),
        apiClient.get('/api/unidades-medida'),
      ]);
      setRecetas(recetasRes.data?.data ?? []);
      setUnidades(Array.isArray(unidadesRes.data) ? unidadesRes.data : []);
    } catch (err) {
      console.error(err);
      setRecetas([]);
      setUnidades([]);
    }
  }, []);

  /** Refresca las dos mitades de la pantalla: la del marco y la del núcleo. */
  const load = useCallback(async () => {
    setRefresco(prev => prev + 1);
    await loadMarco();
  }, [loadMarco]);

  useEffect(() => {
    // Sin la sucursal resuelta el pedido saldría sin local y traería el
    // inventario de todo el negocio.
    if (!listo) return;
    loadMarco();
  }, [loadMarco, listo]);

  const insumosActivos = useMemo(() => insumos.filter(i => i.activo), [insumos]);

  // KPIs de cabecera: siempre sobre activos (los de baja no son inventario operativo)
  const counts = useMemo(() => {
    return insumosActivos.reduce((acc, insumo) => {
      acc[stockState(insumo)] += 1;
      return acc;
    }, { ok: 0, bajo: 0, critico: 0, agotado: 0 } as Record<EstadoStock, number>);
  }, [insumosActivos]);

  const recipesByProduct = useMemo(() => {
    const groups = new Map<number, { producto: Receta['producto']; items: Receta[]; costo: number }>();
    for (const receta of recetas) {
      const group = groups.get(receta.producto_id) ?? { producto: receta.producto, items: [], costo: 0 };
      group.items.push(receta);
      group.costo += Number(receta.cantidad_utilizada || 0) * Number(receta.insumo?.costo_promedio || 0);
      groups.set(receta.producto_id, group);
    }
    return Array.from(groups.values()).sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre));
  }, [recetas]);

  const unidadesActivas = useMemo(() => unidades.filter(u => u.activo), [unidades]);

  const unidadesParaSelect = useMemo(() => {
    if (!form.unidad_medida || unidadesActivas.some(u => u.nombre === form.unidad_medida)) {
      return unidadesActivas;
    }
    return [...unidadesActivas, { id: -1, nombre: form.unidad_medida, activo: false }];
  }, [unidadesActivas, form.unidad_medida]);

  const openUnidadModal = (action: 'crear' | 'editar', unidad?: UnidadMedidaRow) => {
    setUnidadError('');
    setUnidadModal(action);
    setSelectedUnidad(unidad ?? null);
    setUnidadForm(action === 'editar' && unidad
      ? { nombre: unidad.nombre, activo: unidad.activo }
      : { nombre: '', activo: true });
  };

  const closeUnidadModal = () => {
    setUnidadModal(null);
    setSelectedUnidad(null);
    setUnidadForm({ nombre: '', activo: true });
    setUnidadError('');
  };

  const submitUnidad = async (event: FormEvent) => {
    event.preventDefault();
    setUnidadSaving(true);
    setUnidadError('');
    try {
      const nombreTrim = unidadForm.nombre.trim();
      let saved: UnidadMedidaRow;
      if (unidadModal === 'crear') {
        const res = await apiClient.post('/api/unidades-medida', { nombre: nombreTrim });
        saved = res.data;
      } else {
        const res = await apiClient.put(`/api/unidades-medida/${selectedUnidad!.id}`, {
          nombre: nombreTrim,
          activo: unidadForm.activo,
        });
        saved = res.data;
      }
      const quickAddDesdeInsumo = unidadModal === 'crear' && modalAction !== null;
      closeUnidadModal();
      await load();
      if (quickAddDesdeInsumo) {
        setForm(prev => ({ ...prev, unidad_medida: saved.nombre }));
      }
    } catch (err) {
      setUnidadError(errorMsg(err));
    } finally {
      setUnidadSaving(false);
    }
  };

  const handleToggleUnidad = async (unidad: UnidadMedidaRow) => {
    setPageMsg(null);
    try {
      await apiClient.put(`/api/unidades-medida/${unidad.id}`, { activo: !unidad.activo });
      await load();
    } catch (err) {
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  const handleDeleteUnidad = async (unidad: UnidadMedidaRow) => {
    if (!window.confirm(`¿Eliminar la unidad "${unidad.nombre}"?`)) return;
    setPageMsg(null);
    try {
      await apiClient.delete(`/api/unidades-medida/${unidad.id}`);
      setPageMsg({ type: 'ok', text: `Unidad "${unidad.nombre}" eliminada.` });
      await load();
    } catch (err) {
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  const totalValue = insumosActivos.reduce((sum, item) => sum + item.stock_actual * item.costo_promedio, 0);

  const openModal = (action: ModalAction, insumo?: Insumo) => {
    setFormError('');
    setModalAction(action);
    setSelected(insumo ?? null);
    if (action === 'editar' && insumo) {
      setForm({
        ...EMPTY_FORM,
        nombre: insumo.nombre,
        categoria_insumo: insumo.categoria_insumo ?? '',
        unidad_medida: insumo.unidad_medida,
        costo_promedio: String(insumo.costo_promedio),
        stock_minimo: String(insumo.stock_minimo),
        punto_critico: String(insumo.punto_critico),
        proveedor: insumo.proveedor ?? '',
        equivalencia_unidad: insumo.equivalencia_unidad ?? '',
        equivalencia_cantidad: insumo.equivalencia_cantidad != null ? String(insumo.equivalencia_cantidad) : '',
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
  };

  const closeModal = () => {
    setModalAction(null);
    setSelected(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setResultadoBaja(null);
    setResultadoReactivar(null);
  };

  const handleDelete = async (insumo: Insumo) => {
    if (!window.confirm(`¿Eliminar el insumo "${insumo.nombre}"? Esta acción no se puede deshacer.`)) return;
    setPageMsg(null);
    try {
      await apiClient.delete(`/api/insumo/${insumo.id}`);
      setPageMsg({ type: 'ok', text: `Insumo "${insumo.nombre}" eliminado.` });
      await load();
    } catch (err) {
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  /**
   * Saca el insumo del inventario de la sucursal elegida. No elimina el insumo:
   * la ficha es del negocio y la comparten las recetas y el histórico de todos
   * los locales. Si acá hubo movimientos o queda stock, el servidor lo rechaza.
   */
  const handleQuitarDeSucursal = async (insumo: Insumo) => {
    if (!sucursal) return;
    setPageMsg(null);
    try {
      await apiClient.delete(`/api/insumo/${insumo.id}/sucursales`, {
        data: { sucursal_id: Number(sucursal) },
      });
      setQuitarConfirm(null);
      setPageMsg({
        type: 'ok',
        text: `"${insumo.nombre}" salió del inventario de ${nombreSucursal ?? 'esta sucursal'}. El insumo sigue existiendo en el negocio.`,
      });
      await load();
    } catch (err) {
      setQuitarConfirm(null);
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  const handleReactivar = async (insumo: Insumo) => {
    if (!sucursal) {
      setPageMsg({ type: 'error', text: 'Elegí una sucursal: el insumo se reactiva en ese local.' });
      return;
    }
    if (!window.confirm(`¿Reactivar el insumo "${insumo.nombre}" en ${nombreSucursal ?? 'esta sucursal'}? Los productos que estaban en revisión acá se resolverán automáticamente.`)) return;
    setPageMsg(null);
    try {
      const resultado = await reactivar.mutateAsync({ id: insumo.id, sucursalId: Number(sucursal) });
      setResultadoReactivar(resultado);
      setPageMsg({
        type: 'ok',
        text: `Insumo "${resultado.insumo.nombre}" reactivado en ${nombreSucursal ?? 'esta sucursal'}. ${resultado.productosResueltos} producto(s) resuelto(s) acá.`,
      });
      await load();
    } catch (err) {
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  const submitModal = async (event: FormEvent) => {
    event.preventDefault();
    if (modalAction === 'crear' || modalAction === 'editar') {
      const tieneUnidad = form.equivalencia_unidad.trim() !== '';
      const tieneCantidad = form.equivalencia_cantidad.trim() !== '';
      if (tieneUnidad !== tieneCantidad) {
        setFormError('Para el contenido por unidad, elige también la medida (kg, gr, lt, ml) o deja la cantidad vacía.');
        return;
      }
    }
    setSaving(true);
    setFormError('');
    // El insumo nace y se edita en el local que se está viendo; sin selección
    // va a la principal (comportamiento previo a multi-sucursal).
    const sucursalNumero = sucursal ? Number(sucursal) : undefined;
    try {
      if (modalAction === 'crear') {
        await apiClient.post('/api/insumo', {
          categoria_insumo: form.categoria_insumo.trim() || null,
          costo_promedio: Number(form.costo_promedio || 0),
          equivalencia_unidad: form.equivalencia_unidad.trim() || null,
          equivalencia_cantidad: form.equivalencia_cantidad.trim() ? Number(form.equivalencia_cantidad) : null,
          nombre: form.nombre.trim(),
          proveedor: form.proveedor.trim() || null,
          punto_critico: Number(form.punto_critico || 0),
          stock_actual: Number(form.stock_actual || 0),
          stock_minimo: Number(form.stock_minimo || 0),
          unidad_medida: form.unidad_medida,
          sucursal_id: sucursalNumero,
        });
      }
      if (modalAction === 'editar' && selected) {
        await apiClient.put(`/api/insumo/${selected.id}`, {
          categoria_insumo: form.categoria_insumo.trim() || null,
          costo_promedio: Number(form.costo_promedio || 0),
          equivalencia_unidad: form.equivalencia_unidad.trim() || null,
          equivalencia_cantidad: form.equivalencia_cantidad.trim() ? Number(form.equivalencia_cantidad) : null,
          nombre: form.nombre.trim(),
          proveedor: form.proveedor.trim() || null,
          punto_critico: Number(form.punto_critico || 0),
          // El stock NO se manda: editar un insumo no puede cambiarlo. Reenviar
          // el valor de pantalla pisaba las ventas descontadas mientras la lista
          // estaba abierta. Para corregirlo está el conteo físico (✓).
          stock_minimo: Number(form.stock_minimo || 0),
          unidad_medida: form.unidad_medida,
          // El costo y los umbrales que se usan de verdad son los de esta
          // sucursal (StockSucursal); sin mandarla, el backend no sabe a qué
          // local aplicarle el cambio.
          sucursal_id: sucursalNumero,
        });
      }
      if (modalAction === 'baja' && selected) {
        // La baja es del local: sin sucursal elegida no hay dónde aplicarla.
        if (!sucursalNumero) {
          setFormError('Elegí una sucursal arriba: el insumo se da de baja en ese local, no en todo el negocio.');
          return;
        }
        const resultado = await darDeBaja.mutateAsync({
          id: selected.id,
          motivo: form.descripcion.trim() || `Baja de ${selected.nombre}`,
          sucursalId: sucursalNumero,
        });
        setResultadoBaja(resultado);
        setPageMsg({
          type: 'ok',
          text: `Insumo "${resultado.insumo.nombre}" dado de baja en ${nombreSucursal ?? 'esta sucursal'}. ${resultado.productosEnRevision} producto(s) pasó/pasaron a revisión acá. Las demás sucursales no se tocaron.`,
        });
        await load(); // Refresca la tabla detrás del modal de resultado
        return; // No cierra el modal aún, muestra resultado
      }
      closeModal();
      await load();
    } catch (err) {
      setFormError(errorMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const modalTitle = modalAction === 'crear'
    ? 'Nuevo insumo'
    : modalAction === 'editar'
      ? `Editar insumo · ${selected?.nombre ?? ''}`
      : `Dar de baja · ${selected?.nombre ?? ''}`;

  return (
    <div className="admin-inventory">
      <div className="admin-page-header">
        <div>
          <h1>Inventario</h1>
          <p>Stock, movimientos y fichas técnicas{readOnly ? ' · solo lectura (lo gestiona el administrador)' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <SucursalSelector value={sucursal} onChange={setSucursal} />
          <button className="admin-btn secondary" onClick={load} type="button">Actualizar</button>
          {/* Con una sucursal elegida el inventario es el de ese local: se puede
              poblar trayendo insumos de otro sin recrearlos a mano. */}
          {!readOnly && sucursal && (
            <button className="admin-btn" onClick={() => setCopiarAbierto(true)} type="button">Agregar de otra sucursal</button>
          )}
          {!readOnly && <button className="admin-btn primary" onClick={() => openModal('crear')} type="button">+ Insumo</button>}
        </div>
      </div>

      {pageMsg && (
        <div
          className="gate-warning"
          style={pageMsg.type === 'ok'
            ? { background: 'rgba(31,169,113,.12)', borderColor: 'rgba(31,169,113,.35)', color: 'var(--fresh)', marginBottom: 14 }
            : { marginBottom: 14 }}
          onClick={() => setPageMsg(null)}
        >
          {pageMsg.text}
        </div>
      )}

      <div className="inv-summary">
        <div className="inv-stat"><div className="inv-stat-label">Valor total</div><div className="inv-stat-val">{money(totalValue)}</div></div>
        <div className="inv-stat"><div className="inv-stat-label">Bajo umbral</div><div className="inv-stat-val" style={{ color: 'var(--amber)' }}>{counts.bajo}</div></div>
        <div className="inv-stat"><div className="inv-stat-label">Críticos</div><div className="inv-stat-val" style={{ color: 'var(--danger)' }}>{counts.critico + counts.agotado}</div></div>
        <div className="inv-stat"><div className="inv-stat-label">Insumos</div><div className="inv-stat-val">{insumosActivos.length}</div></div>
      </div>

      <div className="inv-tabs">
        {[
          ['insumos', 'Insumos'],
          ['movimientos', 'Movimientos'],
          ['recetas', 'Recetas'],
          // Unidades es solo una pantalla de administración (crear/editar unidades)
          ...(readOnly ? [] : [['unidades', 'Unidades']]),
        ].map(([key, label]) => (
          <button key={key} className={`inv-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key as Tab)} type="button">
            {label}
          </button>
        ))}
      </div>

      {/* El núcleo se monta siempre: cambiar de pestaña no puede costar una
          recarga del inventario ni perder el filtro que había escrito. */}
      <NucleoInventario
        ambito={AMBITO_SUCURSAL}
        contextoId={sucursal ? Number(sucursal) : 0}
        vista={tab === 'insumos' || tab === 'movimientos' ? tab : 'oculto'}
        habilitado={listo}
        readOnly={readOnly}
        estadoNoEsReal={consolidado}
        onInsumos={setInsumos}
        refresco={refresco}
        mensajeSinInsumos={nombreSucursal
          ? `${nombreSucursal} todavía no maneja ningún insumo. Traelos de otra sucursal o creá el primero.`
          : 'Crea el primer insumo para controlar el stock.'}
        accionSinInsumos={<button className="admin-btn primary" onClick={() => openModal('crear')} type="button">+ Insumo</button>}
        accionesFicha={insumo => (
          <button className="action-btn edit" title="Editar insumo (nombre, costo, mínimos, proveedor)" onClick={() => openModal('editar', insumo)} type="button">✏</button>
        )}
        accionesAlcance={insumo => (
          <>
            <button
              className="action-btn delete"
              title={sucursal
                ? `Dar de baja en ${nombreSucursal ?? 'esta sucursal'} (las demás lo siguen usando)`
                : 'Elegí una sucursal: la baja del insumo es de un local'}
              disabled={!sucursal}
              onClick={() => openModal('baja', insumo)}
              type="button"
            >⛔</button>
            {/* Con una sucursal elegida la papelera saca el insumo del
                inventario DE ESE LOCAL y no borra nada más; el insumo y
                las demás sucursales quedan intactos. En consolidado sigue
                siendo la eliminación del insumo del negocio. */}
            {sucursal ? (
              quitarConfirm === insumo.id ? (
                <>
                  <button className="action-btn confirm-yes" onClick={() => handleQuitarDeSucursal(insumo)} type="button">Sí</button>
                  <button className="action-btn confirm-no" onClick={() => setQuitarConfirm(null)} type="button">No</button>
                </>
              ) : (
                <button
                  className="action-btn delete"
                  title={`Quitar del inventario de ${nombreSucursal ?? 'esta sucursal'} (el insumo no se elimina)`}
                  onClick={() => setQuitarConfirm(insumo.id)}
                  type="button"
                >🗑</button>
              )
            ) : (
              <button className="action-btn delete" title="Eliminar insumo" onClick={() => handleDelete(insumo)} type="button">🗑</button>
            )}
          </>
        )}
        accionesInactivo={insumo => (
          <button
            className="action-btn edit"
            title={sucursal
              ? `Reactivar en ${nombreSucursal ?? 'esta sucursal'}`
              : 'Elegí una sucursal: el insumo se reactiva en un local'}
            disabled={!sucursal}
            onClick={() => handleReactivar(insumo)}
            type="button"
          >↩</button>
        )}
      />

      {tab === 'recetas' && (
        recipesByProduct.length === 0 ? (
          <div className="empty-state"><h4>Sin recetas registradas</h4><p>Las fichas técnicas de productos aparecerán aquí cuando tengan insumos asociados.</p></div>
        ) : (
          <div className="dashboard-grid">
            {recipesByProduct.map(group => (
              <div key={group.producto.id} className="dash-card span-6">
                <div className="dash-card-header">
                  <h3>{group.producto.nombre}</h3>
                  <span className="dash-card-sub">{money(group.costo)} costo receta</span>
                </div>
                <div className="alert-card-list">
                  {group.items.map(item => (
                    <div key={item.id} className="alert-row">
                      <span className="alert-row-name">{item.insumo.nombre}</span>
                      <span className="alert-row-qty">{number(item.cantidad_utilizada)} {item.insumo.unidad_medida}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'unidades' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="admin-btn primary" onClick={() => openUnidadModal('crear')} type="button">+ Nueva unidad</button>
          </div>
          {unidades.length === 0 ? (
            <div className="empty-state"><h4>Sin unidades registradas</h4><p>Crea la primera unidad de medida para usarla en los insumos.</p></div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {unidades.map(unidad => (
                    <tr key={unidad.id}>
                      <td>{unidad.nombre}</td>
                      <td>
                        <span className={`pub-badge ${unidad.activo ? 'publicado' : 'archivado'}`} style={{ color: unidad.activo ? 'var(--fresh)' : 'var(--danger)' }}>
                          {unidad.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="action-btn edit" title="Editar" onClick={() => openUnidadModal('editar', unidad)} type="button">✏</button>
                          <button className="action-btn" title={unidad.activo ? 'Desactivar' : 'Activar'} onClick={() => handleToggleUnidad(unidad)} type="button">{unidad.activo ? '⏸' : '▶'}</button>
                          <button className="action-btn delete" title="Eliminar" onClick={() => handleDeleteUnidad(unidad)} type="button">🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modalAction && (
        <div className="admin-modal-overlay" onMouseDown={closeModal}>
          <form className="admin-modal" onSubmit={submitModal} onMouseDown={event => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{modalTitle}</h3>
              <button className="admin-modal-close" onClick={closeModal} type="button">×</button>
            </div>
            <div className="admin-modal-body">
              {modalAction === 'crear' ? (
                <div className="form-grid">
                  <label className="form-group full"><span>Nombre</span><input value={form.nombre} onChange={event => setForm(prev => ({ ...prev, nombre: event.target.value }))} required /></label>
                  <label className="form-group"><span>Categoría</span><input placeholder="Granos" value={form.categoria_insumo} onChange={event => setForm(prev => ({ ...prev, categoria_insumo: event.target.value }))} /></label>
                  <UnidadFieldGroup
                    unidadMedida={form.unidad_medida}
                    unidadesParaSelect={unidadesParaSelect}
                    equivalenciaUnidad={form.equivalencia_unidad}
                    equivalenciaCantidad={form.equivalencia_cantidad}
                    onUnidadChange={value => setForm(prev => ({ ...prev, unidad_medida: value }))}
                    onEquivalenciaUnidadChange={value => setForm(prev => ({ ...prev, equivalencia_unidad: value }))}
                    onEquivalenciaCantidadChange={value => setForm(prev => ({ ...prev, equivalencia_cantidad: value }))}
                    onNuevaUnidad={() => openUnidadModal('crear')}
                  />
                  <label className="form-group"><span>Stock</span><input type="number" min="0" step="0.01" value={form.stock_actual} onChange={event => setForm(prev => ({ ...prev, stock_actual: event.target.value }))} required /></label>
                  <label className="form-group"><span>Costo unitario (Bs por {medidaInfo(form.unidad_medida).sufijo})</span><input type="number" min="0" step="0.000001" value={form.costo_promedio} onChange={event => setForm(prev => ({ ...prev, costo_promedio: event.target.value }))} /></label>
                  <CostoAyuda unidadBase={form.unidad_medida} onCalculado={costo => setForm(prev => ({ ...prev, costo_promedio: costo }))} />
                  <label className="form-group"><span>Stock mínimo</span><input type="number" min="0" step="0.01" value={form.stock_minimo} onChange={event => setForm(prev => ({ ...prev, stock_minimo: event.target.value }))} required /></label>
                  <label className="form-group"><span>Stock crítico</span><input type="number" min="0" step="0.01" value={form.punto_critico} onChange={event => setForm(prev => ({ ...prev, punto_critico: event.target.value }))} /></label>
                  <label className="form-group full"><span>Proveedor</span><input value={form.proveedor} onChange={event => setForm(prev => ({ ...prev, proveedor: event.target.value }))} /></label>
                </div>
              ) : modalAction === 'editar' ? (
                <div className="form-grid">
                  <label className="form-group full"><span>Nombre</span><input value={form.nombre} onChange={event => setForm(prev => ({ ...prev, nombre: event.target.value }))} required /></label>
                  <label className="form-group"><span>Categoría</span><input placeholder="Granos" value={form.categoria_insumo} onChange={event => setForm(prev => ({ ...prev, categoria_insumo: event.target.value }))} /></label>
                  <UnidadFieldGroup
                    unidadMedida={form.unidad_medida}
                    unidadesParaSelect={unidadesParaSelect}
                    equivalenciaUnidad={form.equivalencia_unidad}
                    equivalenciaCantidad={form.equivalencia_cantidad}
                    onUnidadChange={value => setForm(prev => ({ ...prev, unidad_medida: value }))}
                    onEquivalenciaUnidadChange={value => setForm(prev => ({ ...prev, equivalencia_unidad: value }))}
                    onEquivalenciaCantidadChange={value => setForm(prev => ({ ...prev, equivalencia_cantidad: value }))}
                    onNuevaUnidad={() => openUnidadModal('crear')}
                  />
                  <label className="form-group"><span>Costo unitario (Bs por {medidaInfo(form.unidad_medida).sufijo})</span><input type="number" min="0" step="0.000001" value={form.costo_promedio} onChange={event => setForm(prev => ({ ...prev, costo_promedio: event.target.value }))} /></label>
                  <CostoAyuda unidadBase={form.unidad_medida} onCalculado={costo => setForm(prev => ({ ...prev, costo_promedio: costo }))} />
                  <label className="form-group"><span>Stock mínimo</span><input type="number" min="0" step="0.01" value={form.stock_minimo} onChange={event => setForm(prev => ({ ...prev, stock_minimo: event.target.value }))} required /></label>
                  <label className="form-group"><span>Stock crítico</span><input type="number" min="0" step="0.01" value={form.punto_critico} onChange={event => setForm(prev => ({ ...prev, punto_critico: event.target.value }))} /></label>
                  <label className="form-group full"><span>Proveedor</span><input value={form.proveedor} onChange={event => setForm(prev => ({ ...prev, proveedor: event.target.value }))} /></label>
                  <div className="form-group full">
                    <span className="form-hint">
                      Este formulario no cambia la cantidad en stock. Para corregir una cantidad mal registrada, usa el botón ✓ "Corregir stock" en la fila del insumo.
                    </span>
                  </div>
                </div>
              ) : (
                resultadoBaja ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="gate-warning" style={{ background: 'rgba(31,169,113,.12)', borderColor: 'rgba(31,169,113,.35)', color: 'var(--fresh)' }}>
                      ✅ Insumo "{resultadoBaja.insumo.nombre}" dado de baja correctamente.
                    </div>
                    {resultadoBaja.productosEnRevision > 0 && (
                      <>
                        <div>
                          <strong style={{ color: 'var(--amber)' }}>⚠️ {resultadoBaja.productosEnRevision} producto(s) requiere(n) revisión:</strong>
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                            {resultadoBaja.productos.map(p => (
                              <div key={p.id} style={{ padding: '8px 10px', background: 'var(--surface-soft)', borderRadius: 'var(--radius)', borderLeft: '3px solid var(--amber)' }}>
                                <strong>{p.nombre}</strong>
                              </div>
                            ))}
                          </div>
                          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--slate)' }}>
                            Estos productos están en estado "EN REVISIÓN". Ve a la sección "Productos en Revisión" en el admin para editarlos o darlos de baja.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="form-grid">
                    <label className="form-group full"><span>Motivo de la baja</span><textarea rows={3} value={form.descripcion} onChange={event => setForm(prev => ({ ...prev, descripcion: event.target.value }))} placeholder="Ej: Proveedor descontinuó, Cambio de receta, etc." required /></label>
                    <div className="form-group full">
                      <span className="form-hint">
                        Si este insumo está en recetas de productos, esos productos pasarán a estado "EN REVISIÓN" para que los edites o los des de baja.
                      </span>
                    </div>
                  </div>
                )
              )}
              {formError && <div className="gate-warning" style={{ marginTop: 12 }}>{formError}</div>}
            </div>
            <div className="admin-modal-footer">
              {modalAction === 'baja' && resultadoBaja ? (
                <button className="admin-btn primary" onClick={closeModal} type="button">Cerrar</button>
              ) : (
                <>
                  <button className="admin-btn secondary" onClick={closeModal} type="button">Cancelar</button>
                  <button className="admin-btn primary" disabled={saving || darDeBaja.isPending} type="submit">{saving || darDeBaja.isPending ? 'Guardando...' : 'Guardar'}</button>
                </>
              )}
            </div>
          </form>
        </div>
      )}

      {unidadModal && (
        <div className="admin-modal-overlay" style={{ zIndex: 110 }} onMouseDown={closeUnidadModal}>
          <form className="admin-modal compact" onSubmit={submitUnidad} onMouseDown={event => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{unidadModal === 'crear' ? 'Nueva unidad' : `Editar unidad · ${selectedUnidad?.nombre ?? ''}`}</h3>
              <button className="admin-modal-close" onClick={closeUnidadModal} type="button">×</button>
            </div>
            <div className="admin-modal-body">
              <div className="form-grid">
                <label className="form-group full">
                  <span>Nombre</span>
                  <input
                    value={unidadForm.nombre}
                    onChange={event => setUnidadForm(prev => ({ ...prev, nombre: event.target.value }))}
                    placeholder="Ej. paquete, caja, sobre"
                    required
                  />
                </label>
                {unidadModal === 'editar' && (
                  <label className="form-group full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={unidadForm.activo}
                      onChange={event => setUnidadForm(prev => ({ ...prev, activo: event.target.checked }))}
                    />
                    <span>Activa (disponible para nuevos insumos)</span>
                  </label>
                )}
              </div>
              {unidadError && <div className="gate-warning" style={{ marginTop: 12 }}>{unidadError}</div>}
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn secondary" onClick={closeUnidadModal} type="button">Cancelar</button>
              <button className="admin-btn primary" disabled={unidadSaving} type="submit">{unidadSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}

      {copiarAbierto && sucursal && (
        <CopiarInsumosModal
          destino={Number(sucursal)}
          destinoNombre={nombreSucursal ?? 'esta sucursal'}
          onClose={() => setCopiarAbierto(false)}
          onCopiado={(cantidad) => {
            setCopiarAbierto(false);
            setPageMsg({ type: 'ok', text: `${cantidad} insumo(s) agregados al inventario de ${nombreSucursal ?? 'esta sucursal'}, con stock en cero.` });
            load();
          }}
        />
      )}
    </div>
  );
}

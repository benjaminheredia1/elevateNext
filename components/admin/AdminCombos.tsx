'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '@/hooks/api';
import SucursalSelector from '@/components/ui/SucursalSelector';
import MoneyText from '@/components/ui/MoneyText';
import EmptyState from '@/components/ui/EmptyState';
import { useSucursales } from '@/hooks/sucursales';
import { useSucursalAdmin } from '@/hooks/sucursal-admin';

interface ComboItem { producto_id: number; nombre: string; cantidad: number }

type TipoPromo = 'COMBO' | 'DESCUENTO';

interface Vigencia {
  fecha_inicio: string;
  fecha_fin: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  dias_semana: number[];
}

interface Promocion {
  id: number;
  tipo: TipoPromo;
  nombre: string;
  descripcion: string | null;
  modo_precio: ModoPrecio;
  monto: number;
  activo: boolean;
  en_todas_las_sucursales: boolean;
  vigente: boolean;
  vigencia: string;
  /** Solo en combos: precio armado y stock. */
  precio_lista: number | null;
  precio: number | null;
  ahorro: number | null;
  rinde: number | null;
  agotado: boolean;
  items: ComboItem[];
  sucursales: { sucursal_id: number; monto: number | null; disponible: boolean }[];
  vigencias: Vigencia[];
}

interface ProductoOpt { id: number; nombre: string; precio: number }

type ModoPrecio = 'PORCENTAJE' | 'PRECIO_FIJO' | 'MONTO_DESCUENTO';

const DIAS = [
  { n: 1, label: 'Lu' }, { n: 2, label: 'Ma' }, { n: 3, label: 'Mi' },
  { n: 4, label: 'Ju' }, { n: 5, label: 'Vi' }, { n: 6, label: 'Sá' }, { n: 7, label: 'Do' },
];

interface FormState {
  id?: number;
  tipo: TipoPromo;
  nombre: string;
  descripcion: string;
  modo_precio: ModoPrecio;
  monto: string;
  items: { producto_id: number; cantidad: number }[];
  fecha_inicio: string;
  fecha_fin: string;
  hora_inicio: string;
  hora_fin: string;
  dias_semana: number[];
}

const HOY = () => new Date().toISOString().slice(0, 10);
/** 'YYYY-MM-DD' de una fecha ISO, para los inputs date. */
const soloFecha = (iso: string) => new Date(iso).toISOString().slice(0, 10);

const formVacio = (tipo: TipoPromo): FormState => ({
  tipo,
  nombre: '', descripcion: '', modo_precio: 'PORCENTAJE', monto: '20',
  items: [],
  fecha_inicio: HOY(), fecha_fin: HOY(),
  hora_inicio: '07:00', hora_fin: '12:00',
  dias_semana: [],
});

function errorMsg(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error ?? 'No se pudo guardar.';
}

/**
 * Combos y promociones por horario, en una sola pantalla.
 *
 * Las dos formas comparten vigencia (fechas + días + franja) y sucursal, y se
 * diferencian en qué hacen con los productos:
 *
 * - COMBO: paquete que el cajero cobra como UNA línea, a precio fijo o con un %
 *   sobre lo que suman sus productos en esta sucursal.
 * - DESCUENTO: abarata productos que se siguen vendiendo por separado.
 */
export default function AdminCombos() {
  // Sale del store del panel: es la misma que muestra la barra lateral.
  const { sucursal, setSucursal, listo } = useSucursalAdmin();
  const { data: sucursales = [] } = useSucursales();
  const nombreSucursal = useMemo(
    () => (sucursal ? sucursales.find(s => s.id === Number(sucursal))?.nombre : undefined),
    [sucursales, sucursal],
  );

  const [combos, setCombos] = useState<Promocion[]>([]);
  const [productos, setProductos] = useState<ProductoOpt[]>([]);
  const [loading, setLoading] = useState(true);
  /** null = cerrado; 'tipo' = preguntando qué se va a crear; 'form' = editando. */
  const [paso, setPaso] = useState<null | 'tipo' | 'form'>(null);
  const [form, setForm] = useState<FormState>(formVacio('COMBO'));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  /**
   * Carga en curso: la pantalla pide una vez antes de saber en qué sucursal
   * está y otra después. Sin este número, la primera puede llegar más tarde y
   * dejar en pantalla los combos de otro local.
   */
  const pedido = useRef(0);

  const cargar = async () => {
    const mio = ++pedido.current;
    setLoading(true);
    try {
      const query = sucursal ? `?sucursal=${sucursal}` : '';
      const [resCombos, resProductos] = await Promise.all([
        apiClient.get(`/api/admin/combos${query}`),
        apiClient.get(`/api/admin/productos${query}`),
      ]);
      if (mio !== pedido.current) return;
      setCombos(resCombos.data?.data ?? []);
      setProductos((resProductos.data?.data ?? []).map((p: ProductoOpt) => ({ id: p.id, nombre: p.nombre, precio: p.precio })));
    } catch {
      if (mio !== pedido.current) return;
      setCombos([]);
      setProductos([]);
    } finally {
      if (mio === pedido.current) setLoading(false);
    }
  };

  /** Abre el formulario ya cargado con la promoción existente. */
  const editar = (promo: Promocion) => {
    const v = promo.vigencias[0];
    setForm({
      id: promo.id,
      tipo: promo.tipo,
      nombre: promo.nombre,
      descripcion: promo.descripcion ?? '',
      modo_precio: promo.modo_precio,
      monto: String(promo.monto),
      items: promo.items.map(i => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
      // Sin vigencia cargada (promos viejas) se ofrece hoy como punto de partida.
      fecha_inicio: v ? soloFecha(v.fecha_inicio) : HOY(),
      fecha_fin: v ? soloFecha(v.fecha_fin) : HOY(),
      hora_inicio: v?.hora_inicio ?? '',
      hora_fin: v?.hora_fin ?? '',
      dias_semana: v?.dias_semana ?? [],
    });
    setError('');
    setPaso('form');
  };

  // Sin la sucursal resuelta no se pide nada: traería los combos de todos.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (listo) cargar(); }, [sucursal, listo]);

  const set = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }));

  const alternarProducto = (id: number) => {
    setForm(prev => {
      const existe = prev.items.find(i => i.producto_id === id);
      return {
        ...prev,
        items: existe
          ? prev.items.filter(i => i.producto_id !== id)
          : [...prev.items, { producto_id: id, cantidad: 1 }],
      };
    });
  };

  const cambiarCantidad = (id: number, cantidad: number) => {
    set({ items: form.items.map(i => i.producto_id === id ? { ...i, cantidad: Math.max(1, cantidad) } : i) });
  };

  const alternarDia = (n: number) => {
    set({ dias_semana: form.dias_semana.includes(n) ? form.dias_semana.filter(d => d !== n) : [...form.dias_semana, n] });
  };

  // Vista previa del precio, con los precios de ESTA sucursal.
  const precioLista = form.items.reduce((suma, item) => {
    const p = productos.find(x => x.id === item.producto_id);
    return suma + (p ? p.precio * item.cantidad : 0);
  }, 0);
  const montoNum = Number(form.monto) || 0;
  const precioFinal = form.modo_precio === 'PRECIO_FIJO'
    ? montoNum
    : Math.max(0, precioLista - (precioLista * montoNum) / 100);

  const esCombo = form.tipo === 'COMBO';
  const etiqueta = esCombo ? 'combo' : 'promoción';

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!sucursal) {
      setError(`Elegí una sucursal: el ${etiqueta} se publica en un local concreto.`);
      return;
    }
    if (form.items.length === 0) {
      setError(esCombo ? 'Agregá al menos un producto al combo.' : 'Elegí al menos un producto a descontar.');
      return;
    }
    setGuardando(true);
    try {
      const body = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        tipo: form.tipo,
        modo_precio: form.modo_precio,
        monto: montoNum,
        items: form.items,
        sucursales: [{ sucursal_id: Number(sucursal), disponible: true }],
        vigencias: [{
          fecha_inicio: form.fecha_inicio,
          // Se toma el día de fin COMPLETO: con la fecha pelada, Postgres la
          // interpreta a las 00:00 y el último día quedaría fuera.
          fecha_fin: `${form.fecha_fin}T23:59:59`,
          hora_inicio: form.hora_inicio || null,
          hora_fin: form.hora_fin || null,
          dias_semana: form.dias_semana,
        }],
      };

      if (form.id) await apiClient.put(`/api/admin/combos/${form.id}`, body);
      else await apiClient.post('/api/admin/combos', body);

      setPaso(null);
      setForm(formVacio('COMBO'));
      setMensaje({
        type: 'ok',
        text: form.id
          ? `Cambios guardados en "${body.nombre}".`
          : `${esCombo ? 'Combo creado' : 'Promoción creada'} y publicad${esCombo ? 'o' : 'a'} en ${nombreSucursal ?? 'esta sucursal'}.`,
      });
      await cargar();
    } catch (err) {
      setError(errorMsg(err));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (combo: Promocion) => {
    if (!window.confirm(`¿Eliminar "${combo.nombre}"?`)) return;
    setMensaje(null);
    try {
      await apiClient.delete(`/api/admin/combos/${combo.id}`);
      setMensaje({ type: "ok", text: `"${combo.nombre}" eliminado.` });
      await cargar();
    } catch (err) {
      setMensaje({ type: 'error', text: errorMsg(err) });
    }
  };

  return (
    <div className="admin-products">
      <div className="admin-page-header">
        <div>
          <h1>Combos y promociones</h1>
          <p>
            Combos con precio propio y descuentos por producto, disponibles solo en su horario
            {nombreSucursal && <> · precios de <strong>{nombreSucursal}</strong></>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <SucursalSelector value={sucursal} onChange={setSucursal} />
          <button
            className="admin-btn primary"
            type="button"
            disabled={!sucursal}
            title={sucursal ? undefined : 'Elegí una sucursal: se publica en un local'}
            onClick={() => { setError(''); setPaso('tipo'); }}
          >
            + Nueva promoción
          </button>
        </div>
      </div>

      {mensaje && (
        <div
          className="gate-warning"
          style={mensaje.type === 'ok'
            ? { background: 'rgba(31,169,113,.12)', borderColor: 'rgba(31,169,113,.35)', color: 'var(--fresh)', marginBottom: 14, cursor: 'pointer' }
            : { marginBottom: 14, cursor: 'pointer' }}
          onClick={() => setMensaje(null)}
        >
          {mensaje.text}
        </div>
      )}

      {loading ? (
        <div className="empty-state"><h4>Cargando promociones…</h4></div>
      ) : combos.length === 0 ? (
        <EmptyState
          title="Sin promociones"
          hint={sucursal
            ? `${nombreSucursal ?? 'Esta sucursal'} todavía no tiene combos ni descuentos. Creá el primero.`
            : 'Elegí una sucursal para ver y crear sus promociones.'}
        />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Promoción</th>
                <th>Productos</th>
                <th className="num">Lista</th>
                <th className="num">Precio</th>
                <th>Vigencia</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {combos.map(combo => (
                <tr key={combo.id}>
                  <td>
                    <div className="admin-cell-title">
                      {combo.tipo === 'COMBO' ? '🎁 ' : '％ '}{combo.nombre}
                    </div>
                    <div className="admin-cell-sub">
                      {combo.tipo === 'COMBO' ? 'Combo' : 'Descuento por producto'}
                      {/* Las promos anteriores a multi-sucursal no tienen local
                          asignado y siguen valiendo en todos. */}
                      {combo.en_todas_las_sucursales && ' · todas las sucursales'}
                    </div>
                  </td>
                  <td className="admin-cell-sub">
                    {combo.tipo === 'COMBO'
                      ? combo.items.map(i => `${i.cantidad}× ${i.nombre}`).join(' + ')
                      : combo.items.map(i => i.nombre).join(', ') || '— sin productos asignados'}
                  </td>
                  <td className="num">
                    {combo.precio_lista != null ? <MoneyText value={combo.precio_lista} /> : '—'}
                  </td>
                  <td className="num">
                    {combo.precio != null ? (
                      <>
                        <strong><MoneyText value={combo.precio} /></strong>
                        {(combo.ahorro ?? 0) > 0 && <div className="admin-cell-sub">ahorra <MoneyText value={combo.ahorro!} /></div>}
                      </>
                    ) : (
                      // En un descuento el precio depende de cada producto.
                      <strong>{combo.modo_precio === 'PORCENTAJE' ? `-${combo.monto}%` : `-Bs ${combo.monto}`}</strong>
                    )}
                  </td>
                  <td className="admin-cell-sub">{combo.vigencia || 'Sin vigencia'}</td>
                  <td>
                    {/* "Vigente" es acá y ahora: la misma promoción puede estar
                        activa y aun así fuera de su franja horaria. */}
                    {!combo.activo
                      ? <span className="admin-badge-soft">Desactivada</span>
                      : combo.agotado
                        ? <span className="admin-badge-soft warn">Sin stock</span>
                        : combo.vigente
                          ? <span className="admin-badge-soft fresh">En venta ahora</span>
                          : <span className="admin-badge-soft">Fuera de horario</span>}
                    {combo.rinde != null && <div className="admin-cell-sub">alcanza para {combo.rinde}</div>}
                  </td>
                  <td>
                    <div className="action-btns">
                      <button className="action-btn edit" type="button" title="Editar" onClick={() => editar(combo)}>✏</button>
                      <button className="action-btn delete" type="button" title="Eliminar" onClick={() => eliminar(combo)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paso 1: qué se va a crear. Son dos cosas distintas y conviene
          decidirlo antes, porque el formulario cambia. */}
      {paso === 'tipo' && (
        <div className="admin-modal-overlay" onClick={() => setPaso(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>¿Qué querés crear?</h2>
              <button type="button" className="admin-modal-close" onClick={() => setPaso(null)}>×</button>
            </div>
            <div className="admin-modal-body">
              <div className="type-choice">
                <div className="type-card" onClick={() => { setForm(formVacio('COMBO')); setPaso('form'); }}>
                  <h5>🎁 Combo</h5>
                  <p>
                    Varios productos que se venden juntos como uno solo. El cajero lo cobra
                    en una línea, a precio fijo o con un % sobre lo que suman.
                  </p>
                </div>
                <div className="type-card" onClick={() => { setForm(formVacio('DESCUENTO')); setPaso('form'); }}>
                  <h5>％ Descuento por producto</h5>
                  <p>
                    Abarata productos que se siguen vendiendo por separado. Cada uno baja
                    de precio durante la franja horaria.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {paso === 'form' && (
        <div className="admin-modal-overlay" onClick={() => setPaso(null)}>
          <form className="admin-modal admin-modal-lg" onClick={e => e.stopPropagation()} onSubmit={guardar}>
            <div className="admin-modal-header">
              <h2>
                {form.id ? 'Editar' : 'Nuevo'} {etiqueta} · {nombreSucursal}
              </h2>
              <button type="button" className="admin-modal-close" onClick={() => setPaso(null)}>×</button>
            </div>

            <div className="admin-modal-body">
              <div className="form-grid">
                <div className="form-group full">
                  <label>Nombre</label>
                  <input
                    value={form.nombre}
                    onChange={e => set({ nombre: e.target.value })}
                    placeholder={esCombo ? 'Combo desayuno fit' : 'Happy hour bebidas'}
                    required minLength={2}
                  />
                </div>
                <div className="form-group full">
                  <label>Descripción (opcional)</label>
                  <input value={form.descripcion} onChange={e => set({ descripcion: e.target.value })} />
                </div>
              </div>

              <h4 style={{ margin: '18px 0 8px' }}>
                {esCombo ? '¿Qué lleva el combo?' : '¿Qué productos se descuentan?'}
              </h4>
              <div className="copiar-lista">
                {productos.length === 0 ? (
                  <p className="form-hint">Esta sucursal no tiene productos.</p>
                ) : productos.map(p => {
                  const elegido = form.items.find(i => i.producto_id === p.id);
                  return (
                    <label key={p.id} className="copiar-fila">
                      <input type="checkbox" checked={!!elegido} onChange={() => alternarProducto(p.id)} />
                      <span className="copiar-nombre">{p.nombre}</span>
                      {/* La cantidad solo tiene sentido en un combo: en un
                          descuento cada producto se sigue vendiendo suelto. */}
                      {elegido && esCombo && (
                        <input
                          type="number"
                          min="1"
                          value={elegido.cantidad}
                          onChange={e => cambiarCantidad(p.id, Number(e.target.value))}
                          style={{ width: 60 }}
                          onClick={e => e.preventDefault()}
                        />
                      )}
                      <span className="copiar-precio"><MoneyText value={p.precio} /></span>
                    </label>
                  );
                })}
              </div>

              <h4 style={{ margin: '18px 0 8px' }}>Precio</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Cómo se cobra</label>
                  <select value={form.modo_precio} onChange={e => set({ modo_precio: e.target.value as ModoPrecio })}>
                    <option value="PORCENTAJE">
                      {esCombo ? 'Descuento % sobre la suma' : 'Descuento % sobre cada producto'}
                    </option>
                    <option value="PRECIO_FIJO">
                      {esCombo ? 'Precio fijo en Bs' : 'Precio fijo por producto (Bs)'}
                    </option>
                    {!esCombo && <option value="MONTO_DESCUENTO">Restar Bs a cada producto</option>}
                  </select>
                </div>
                <div className="form-group">
                  <label>
                    {form.modo_precio === 'PORCENTAJE'
                      ? 'Descuento (%)'
                      : form.modo_precio === 'MONTO_DESCUENTO'
                        ? 'Bs a restar'
                        : `Precio ${esCombo ? 'del combo' : 'por producto'} (Bs)`}
                  </label>
                  <input
                    type="number" min="0" step="0.01"
                    max={form.modo_precio === 'PORCENTAJE' ? 100 : undefined}
                    value={form.monto}
                    onChange={e => set({ monto: e.target.value })}
                    required
                  />
                </div>
              </div>
              <span className="form-hint">
                {esCombo ? (
                  <>Suma de sus productos: <MoneyText value={precioLista} /> → se cobra <strong><MoneyText value={precioFinal} /></strong></>
                ) : (
                  <>Se aplica a cada producto elegido por separado; el cajero los sigue vendiendo sueltos.</>
                )}
              </span>

              <h4 style={{ margin: '18px 0 8px' }}>¿Cuándo se vende?</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Desde</label>
                  <input type="date" value={form.fecha_inicio} onChange={e => set({ fecha_inicio: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Hasta</label>
                  <input type="date" value={form.fecha_fin} onChange={e => set({ fecha_fin: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Desde las</label>
                  <input type="time" value={form.hora_inicio} onChange={e => set({ hora_inicio: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Hasta las</label>
                  <input type="time" value={form.hora_fin} onChange={e => set({ hora_fin: e.target.value })} />
                </div>
              </div>
              <div className="form-group full">
                <label>Días (ninguno = todos)</label>
                <div className="admin-cat-filters">
                  {DIAS.map(d => (
                    <button
                      key={d.n}
                      type="button"
                      className={`cat-filter-btn ${form.dias_semana.includes(d.n) ? 'active' : ''}`}
                      onClick={() => alternarDia(d.n)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <span className="form-hint">
                Dejá las horas vacías para que valga todo el día. Si la hora de fin es menor
                que la de inicio (22:00 a 02:00), la franja cruza la medianoche.
              </span>

              {error && <div className="gate-warning" style={{ marginTop: 12 }}>{error}</div>}
            </div>

            <div className="admin-modal-footer">
              <button type="button" className="admin-btn ghost" onClick={() => setPaso(null)}>Cancelar</button>
              <button type="submit" className="admin-btn primary" disabled={guardando}>
                {guardando ? 'Guardando…' : form.id ? 'Guardar cambios' : `Crear ${etiqueta}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

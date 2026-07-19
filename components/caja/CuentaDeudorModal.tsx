'use client';

import { FormEvent, useEffect, useState } from 'react';
import MoneyText from '@/components/ui/MoneyText';
import { useAbonarDeuda, useAplicarDescuentoDeuda, useCobrarDeuda, usePrivilegiosCaja } from '@/hooks/caja';

export type MetodoPago = 'EFECTIVO' | 'QR' | 'TARJETA';

export interface PagoRegistrado {
  id: number;
  monto: number;
  metodo_pago: string | null;
  fecha: string;
  cobrado_por: string;
}

export interface ItemVenta { nombre: string; cantidad: number; precio_unitario: number; subtotal: number }

export interface Deuda {
  id: number;
  contraparte: string;
  concepto: string;
  cliente?: { id: number; nombre: string; telefono: string | null } | null;
  monto: number;
  monto_pagado: number;
  saldo: number;
  estado: string;
  descuento: number;
  motivo_descuento: string | null;
  fecha_fiado: string;
  vencimiento: string | null;
  vencido: boolean;
  origen: { venta_id: number; fecha: string; items: ItemVenta[] } | null;
  pagos: PagoRegistrado[];
}

export interface Deudor {
  key: string;
  clienteId: number | null;
  nombre: string;
  telefono: string | null;
  deudas: Deuda[];
  saldo: number;
  vencidas: number;
}

export function esDeHoy(value: string) {
  return new Date(value).toDateString() === new Date().toDateString();
}

/** Agrupa las deudas pendientes por deudor (cliente registrado o cuenta manual). */
export function agruparDeudores(items: Deuda[]): Deudor[] {
  const grupos = new Map<string, Deudor>();
  for (const d of items) {
    const key = d.cliente ? `c${d.cliente.id}` : `m${d.id}`;
    const g = grupos.get(key) ?? {
      key,
      clienteId: d.cliente?.id ?? null,
      nombre: d.cliente?.nombre ?? d.contraparte,
      telefono: d.cliente?.telefono ?? null,
      deudas: [], saldo: 0, vencidas: 0,
    };
    g.deudas.push(d);
    g.saldo = Number((g.saldo + d.saldo).toFixed(2));
    if (d.vencido) g.vencidas += 1;
    grupos.set(key, g);
  }
  return [...grupos.values()].sort((a, b) => b.saldo - a.saldo);
}

function fmtDate(value: string | null) {
  if (!value) return 'Sin vencimiento';
  return new Date(value).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', QR: 'QR', TARJETA: 'Tarjeta', BANCO: 'Banco',
};

/**
 * Monto en Bs tecleado por el cajero: se guarda como texto para que "0.75" se
 * pueda escribir dígito a dígito (con `value={n || ''}` el 0 inicial se borra
 * solo). Es válido si es > 0 y tiene máximo 2 decimales; inválido bloquea el
 * botón igual que excederse del monto.
 */
const MONTO_RE = /^\d+(\.\d{1,2})?$/;
function parseMonto(texto: string): number | null {
  if (texto === '') return 0; // vacío cuenta como 0 (bloquea, pero sin marcar error)
  if (/^\d+\.$/.test(texto)) return Number(texto.slice(0, -1)); // "0." a medio teclear
  if (!MONTO_RE.test(texto)) return null;
  return Number(texto);
}

/** Selector de método + montos; en MIXTO permite partir efectivo/QR. */
function PagoSelector({ total, onChange }: {
  total: number;
  onChange: (pagos: { metodo_pago: MetodoPago; monto: number }[] | null) => void;
}) {
  const [metodo, setMetodo] = useState<MetodoPago | 'MIXTO'>('EFECTIVO');
  const [monto, setMonto] = useState(total.toFixed(2));
  const [mixtoEfectivo, setMixtoEfectivo] = useState('');
  const [mixtoQr, setMixtoQr] = useState('');

  // Valor inicial: cobrar el total seleccionado en efectivo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onChange([{ metodo_pago: 'EFECTIVO', monto: total }]); }, []);

  const emit = (m: MetodoPago | 'MIXTO', simpleTxt: string, efTxt: string, qrTxt: string) => {
    if (m === 'MIXTO') {
      const ef = parseMonto(efTxt);
      const qr = parseMonto(qrTxt);
      if (ef == null || qr == null) { onChange(null); return; }
      const suma = Number((ef + qr).toFixed(2));
      if (suma <= 0 || suma > total) { onChange(null); return; }
      const pagos: { metodo_pago: MetodoPago; monto: number }[] = [];
      if (ef > 0) pagos.push({ metodo_pago: 'EFECTIVO', monto: ef });
      if (qr > 0) pagos.push({ metodo_pago: 'QR', monto: qr });
      onChange(pagos);
    } else {
      const simple = parseMonto(simpleTxt);
      if (simple == null || simple <= 0 || simple > total) { onChange(null); return; }
      onChange([{ metodo_pago: m, monto: simple }]);
    }
  };

  const hintMonto = (txt: string) => {
    const v = parseMonto(txt);
    if (v == null) return 'Monto inválido: use máximo 2 decimales (ej. 0.75).';
    if (v > total) return 'Supera lo seleccionado.';
    return null;
  };

  const sumaMixto = (parseMonto(mixtoEfectivo) ?? 0) + (parseMonto(mixtoQr) ?? 0);

  return (
    <>
      <div className="form-group">
        <label>Método de pago</label>
        <div className="pay-method-toggle">
          {(['EFECTIVO', 'QR', 'TARJETA', 'MIXTO'] as const).map(m => (
            <button key={m} type="button" className={`pay-method-btn ${metodo === m ? 'active' : ''}`}
              onClick={() => { setMetodo(m); emit(m, monto, mixtoEfectivo, mixtoQr); }}>
              {m === 'MIXTO' ? 'Mixto' : METODO_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      {metodo === 'MIXTO' ? (
        <>
          <div className="form-group">
            <label>Parte en efectivo (Bs)</label>
            <input type="text" inputMode="decimal" placeholder="0.00" value={mixtoEfectivo}
              onChange={e => { const v = e.target.value; setMixtoEfectivo(v); emit('MIXTO', monto, v, mixtoQr); }} />
            {hintMonto(mixtoEfectivo) && <span className="form-hint" style={{ color: 'var(--danger)' }}>{hintMonto(mixtoEfectivo)}</span>}
          </div>
          <div className="form-group">
            <label>Parte por QR (Bs)</label>
            <input type="text" inputMode="decimal" placeholder="0.00" value={mixtoQr}
              onChange={e => { const v = e.target.value; setMixtoQr(v); emit('MIXTO', monto, mixtoEfectivo, v); }} />
            {hintMonto(mixtoQr) && <span className="form-hint" style={{ color: 'var(--danger)' }}>{hintMonto(mixtoQr)}</span>}
          </div>
          <span className="form-hint">
            Total del cobro: Bs {sumaMixto.toFixed(2)} de Bs {total.toFixed(2)} seleccionados
            {sumaMixto > total ? ' — supera lo seleccionado' : ''}
          </span>
        </>
      ) : (
        <div className="form-group">
          <label>Monto a cobrar (Bs)</label>
          <input type="text" inputMode="decimal" placeholder="0.00" value={monto}
            onChange={e => { const v = e.target.value; setMonto(v); emit(metodo, v, mixtoEfectivo, mixtoQr); }} required />
          <span className="form-hint" style={hintMonto(monto) ? { color: 'var(--danger)' } : {}}>
            {hintMonto(monto) ?? 'Puede cobrar menos: lo que falte queda como deuda pendiente.'}
          </span>
        </div>
      )}
    </>
  );
}

/**
 * Aplica a la deuda un privilegio que se olvidó al vender: el cajero solo elige
 * cuál; el % y el monto descontado los calcula el servidor (igual que en venta).
 * Un solo privilegio por deuda, y solo para clientes registrados.
 */
function DescuentoEditor({ deuda, onDone }: { deuda: Deuda; onDone: (msg: string) => void }) {
  const descuento = useAplicarDescuentoDeuda();
  const { data: privilegios } = usePrivilegiosCaja();
  const [abierto, setAbierto] = useState(false);
  const [privilegioId, setPrivilegioId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sin cliente registrado no hay privilegios (regla de venta); uno solo por deuda
  if (!deuda.cliente || deuda.descuento > 0) return null;

  if (!abierto) {
    return (
      <button type="button" className="admin-btn ghost" style={{ marginTop: 6, padding: '4px 10px', fontSize: 12 }}
        onClick={() => setAbierto(true)}>
        Aplicar privilegio
      </button>
    );
  }

  const elegido = (privilegios ?? []).find(p => p.id === privilegioId) ?? null;
  const preview = elegido ? Number((deuda.monto * elegido.porcentaje / 100).toFixed(2)) : 0;

  const aplicar = () => {
    if (!elegido) return;
    setError(null);
    descuento.mutate({ id: deuda.id, privilegio_id: elegido.id }, {
      onSuccess: res => onDone(res.saldo <= 0
        ? `Privilegio "${elegido.nombre}" aplicado. La deuda quedó saldada.`
        : `Privilegio "${elegido.nombre}" aplicado (−Bs ${Number(res.descuento).toFixed(2)}). Nuevo saldo: Bs ${Number(res.saldo).toFixed(2)}.`),
      onError: () => setError('No se pudo aplicar el privilegio.'),
    });
  };

  return (
    <div className="caja-panel" style={{ marginTop: 8, padding: 10, display: 'grid', gap: 8 }}>
      <strong style={{ fontSize: 13 }}>Privilegio olvidado en la venta</strong>
      {error && <div className="caja-alert error">{error}</div>}
      <div className="form-group" style={{ margin: 0 }}>
        <label>Privilegio</label>
        {(privilegios ?? []).length === 0 ? (
          <span className="form-hint">No hay privilegios activos. El admin los crea en Admin → Privilegios.</span>
        ) : (
          <select value={privilegioId ?? ''} onChange={e => setPrivilegioId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Elegir privilegio —</option>
            {(privilegios ?? []).map(p => (
              <option key={p.id} value={p.id}>{p.nombre} (−{p.porcentaje}%)</option>
            ))}
          </select>
        )}
        {elegido && (
          <span className="form-hint">
            Descuenta Bs {preview.toFixed(2)} del total (Bs {deuda.monto.toFixed(2)} → Bs {(deuda.monto - preview).toFixed(2)}).
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="admin-btn ghost" onClick={() => { setAbierto(false); setError(null); }}>Cancelar</button>
        <button type="button" className="admin-btn primary" disabled={!elegido || descuento.isPending} onClick={aplicar}>
          {descuento.isPending ? 'Aplicando...' : 'Aplicar privilegio'}
        </button>
      </div>
    </div>
  );
}

/** Detalle de una deuda dentro de la cuenta del deudor. */
function DeudaDetalle({ deuda, seleccionada, onToggle, seleccionable, onDescuento }: {
  deuda: Deuda;
  seleccionada: boolean;
  onToggle: () => void;
  seleccionable: boolean;
  onDescuento: (msg: string) => void;
}) {
  return (
    <div className="caja-panel" style={{ padding: 12, opacity: seleccionable && !seleccionada ? 0.55 : 1 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {seleccionable && (
          <input type="checkbox" checked={seleccionada} onChange={onToggle} style={{ marginTop: 4 }} />
        )}
        <div style={{ flex: 1 }}>
          <strong>
            {deuda.origen ? `Venta #${deuda.origen.venta_id}` : deuda.concepto}
            {' · '}{fmtDateTime(deuda.origen?.fecha ?? deuda.fecha_fiado)}
            {esDeHoy(deuda.fecha_fiado) && <span className="admin-badge" style={{ marginLeft: 6 }}>Hoy</span>}
          </strong>
          {deuda.origen && deuda.origen.items.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {deuda.origen.items.map((it, i) => (
                <li key={i}>
                  {it.cantidad}× {it.nombre} — Bs {it.precio_unitario.toFixed(2)} c/u = <strong>Bs {it.subtotal.toFixed(2)}</strong>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 6 }}>
            Total: <strong><MoneyText value={deuda.monto} /></strong>
            {' · '}Pagado: <MoneyText value={deuda.monto_pagado} />
            {' · '}Debe: <strong style={{ color: 'var(--danger)' }}><MoneyText value={deuda.saldo} /></strong>
            {' · '}
            <span style={deuda.vencido ? { color: 'var(--danger)', fontWeight: 700 } : {}}>
              Vence: {fmtDate(deuda.vencimiento)}{deuda.vencido ? ' (vencida)' : ''}
            </span>
          </div>
          {deuda.descuento > 0 && (
            <div className="form-hint" style={{ marginTop: 4, color: 'var(--success, #16a34a)' }}>
              Descuento aplicado: Bs {deuda.descuento.toFixed(2)}
              {deuda.motivo_descuento ? ` — ${deuda.motivo_descuento}` : ''}
            </div>
          )}
          {deuda.pagos.length > 0 && (
            <div className="form-hint" style={{ marginTop: 4 }}>
              Pagos: {deuda.pagos.map(p =>
                `${fmtDateTime(p.fecha)} Bs ${p.monto.toFixed(2)} (${METODO_LABEL[p.metodo_pago ?? ''] ?? 'sin método'}, ${p.cobrado_por})`
              ).join(' · ')}
            </div>
          )}
          <DescuentoEditor deuda={deuda} onDone={onDescuento} />
        </div>
      </div>
    </div>
  );
}

/**
 * Cuenta completa de un deudor: sus deudas, qué pidió, pagos, descuentos y
 * cobro selectivo. `permitirCobro=false` (admin) muestra solo el detalle y el
 * descuento: el cobro de admin no pasa por turno de caja y mantiene su flujo.
 */
export default function CuentaDeudorModal({ deudor, onClose, onDone, permitirCobro = true }: {
  deudor: Deudor;
  onClose: () => void;
  onDone: (msg: string) => void;
  permitirCobro?: boolean;
}) {
  const abonar = useAbonarDeuda();
  const cobrarUna = useCobrarDeuda();
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set(deudor.deudas.map(d => d.id)));
  const [pagos, setPagos] = useState<{ metodo_pago: MetodoPago; monto: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Las cuentas manuales (sin cliente registrado) se cobran una por una
  const esCuentaManual = deudor.clienteId == null;
  const seleccionadas = deudor.deudas.filter(d => seleccion.has(d.id));
  const totalSeleccionado = Number(seleccionadas.reduce((s, d) => s + d.saldo, 0).toFixed(2));
  const totalCobro = pagos ? Number(pagos.reduce((s, p) => s + p.monto, 0).toFixed(2)) : 0;
  const saving = abonar.isPending || cobrarUna.isPending;

  const toggle = (id: number) => {
    setSeleccion(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!permitirCobro) return;
    if (!pagos || totalCobro <= 0 || totalCobro > totalSeleccionado || seleccionadas.length === 0) return;
    setError(null);
    const onSuccess = (res: { saldo_restante?: number; saldo?: number }) => {
      const restante = res.saldo_restante ?? res.saldo ?? 0;
      onDone(restante <= 0
        ? `Cobro registrado. ${deudor.nombre} no debe nada de lo seleccionado.`
        : `Cobro registrado. Saldo pendiente: Bs ${Number(restante).toFixed(2)}.`);
    };
    const onError = () => setError('No se pudo registrar el cobro. ¿Hay caja abierta?');
    if (esCuentaManual) {
      cobrarUna.mutate({ id: seleccionadas[0].id, pagos }, { onSuccess, onError });
    } else {
      abonar.mutate(
        { clienteId: deudor.clienteId!, pagos, cuenta_ids: seleccionadas.map(d => d.id) },
        { onSuccess, onError },
      );
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h2>Cuenta de {deudor.nombre}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="admin-modal-body">
          <div className="finance-modal-note">
            {deudor.telefono ?? 'Sin celular'} · {deudor.deudas.length} deuda(s) pendiente(s)
            {' · '}Debe en total: <strong><MoneyText value={deudor.saldo} /></strong>
          </div>

          {error && <div className="caja-alert error">{error}</div>}

          <div className="form-group">
            <label>{!permitirCobro
              ? 'Deudas pendientes'
              : esCuentaManual ? 'Deudas (cuenta manual: se cobra una a la vez)' : 'Qué deudas cobrar (destilda lo que queda pendiente)'}</label>
            <div style={{ display: 'grid', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
              {deudor.deudas.map(d => (
                <DeudaDetalle
                  key={d.id}
                  deuda={d}
                  seleccionada={seleccion.has(d.id)}
                  onToggle={() => toggle(d.id)}
                  seleccionable={permitirCobro && (!esCuentaManual || deudor.deudas.length > 1)}
                  onDescuento={onDone}
                />
              ))}
            </div>
          </div>

          {permitirCobro && (seleccionadas.length === 0 ? (
            <span className="form-hint">Selecciona al menos una deuda para cobrar.</span>
          ) : (
            <>
              <div className="finance-modal-note">
                Seleccionado a cobrar: <strong><MoneyText value={totalSeleccionado} /></strong>
                {seleccionadas.length < deudor.deudas.length && ' (el resto queda como deuda pendiente)'}
              </div>
              <PagoSelector key={totalSeleccionado} total={totalSeleccionado} onChange={setPagos} />
            </>
          ))}

          {permitirCobro
            ? <span className="form-hint">El cobro entra al turno abierto e impacta el cuadre de caja.</span>
            : <span className="form-hint">Para cobrar desde admin usa &quot;Registrar pago&quot; en la tabla; aquí puedes revisar la cuenta y aplicar descuentos.</span>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>{permitirCobro ? 'Cancelar' : 'Cerrar'}</button>
          {permitirCobro && (
            <button type="submit" className="admin-btn primary"
              disabled={saving || !pagos || totalCobro <= 0 || totalCobro > totalSeleccionado || seleccionadas.length === 0}>
              {saving ? 'Cobrando...'
                : totalCobro >= deudor.saldo ? 'Cobrar todo y saldar cuenta'
                : totalCobro >= totalSeleccionado ? 'Cobrar lo seleccionado'
                : 'Cobro parcial (queda deuda)'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

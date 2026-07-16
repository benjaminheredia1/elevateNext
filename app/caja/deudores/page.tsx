'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import { useAbonarDeuda, useCobrarDeuda, useDeudores } from '@/hooks/caja';

type MetodoPago = 'EFECTIVO' | 'QR' | 'TARJETA';

interface PagoRegistrado {
  id: number;
  monto: number;
  metodo_pago: string | null;
  fecha: string;
  cobrado_por: string;
}

interface ItemVenta { nombre: string; cantidad: number; precio_unitario: number; subtotal: number }

interface Deuda {
  id: number;
  contraparte: string;
  concepto: string;
  cliente?: { id: number; nombre: string; telefono: string | null } | null;
  monto: number;
  monto_pagado: number;
  saldo: number;
  estado: string;
  fecha_fiado: string;
  vencimiento: string | null;
  vencido: boolean;
  origen: { venta_id: number; fecha: string; items: ItemVenta[] } | null;
  pagos: PagoRegistrado[];
}

interface Deudor {
  key: string;
  clienteId: number | null;
  nombre: string;
  telefono: string | null;
  deudas: Deuda[];
  saldo: number;
  vencidas: number;
}

function fmtDate(value: string | null) {
  if (!value) return 'Sin vencimiento';
  return new Date(value).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function esDeHoy(value: string) {
  return new Date(value).toDateString() === new Date().toDateString();
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

/** Detalle de una deuda dentro de la cuenta del deudor. */
function DeudaDetalle({ deuda, seleccionada, onToggle, seleccionable }: {
  deuda: Deuda;
  seleccionada: boolean;
  onToggle: () => void;
  seleccionable: boolean;
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
          {deuda.pagos.length > 0 && (
            <div className="form-hint" style={{ marginTop: 4 }}>
              Pagos: {deuda.pagos.map(p =>
                `${fmtDateTime(p.fecha)} Bs ${p.monto.toFixed(2)} (${METODO_LABEL[p.metodo_pago ?? ''] ?? 'sin método'}, ${p.cobrado_por})`
              ).join(' · ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Cuenta completa de un deudor: sus deudas, qué pidió, pagos y cobro selectivo. */
function CuentaDeudorModal({ deudor, onClose, onDone }: {
  deudor: Deudor;
  onClose: () => void;
  onDone: (msg: string) => void;
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
            <label>{esCuentaManual ? 'Deudas (cuenta manual: se cobra una a la vez)' : 'Qué deudas cobrar (destilda lo que queda pendiente)'}</label>
            <div style={{ display: 'grid', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
              {deudor.deudas.map(d => (
                <DeudaDetalle
                  key={d.id}
                  deuda={d}
                  seleccionada={seleccion.has(d.id)}
                  onToggle={() => toggle(d.id)}
                  seleccionable={!esCuentaManual || deudor.deudas.length > 1}
                />
              ))}
            </div>
          </div>

          {seleccionadas.length === 0 ? (
            <span className="form-hint">Selecciona al menos una deuda para cobrar.</span>
          ) : (
            <>
              <div className="finance-modal-note">
                Seleccionado a cobrar: <strong><MoneyText value={totalSeleccionado} /></strong>
                {seleccionadas.length < deudor.deudas.length && ' (el resto queda como deuda pendiente)'}
              </div>
              <PagoSelector key={totalSeleccionado} total={totalSeleccionado} onChange={setPagos} />
            </>
          )}

          <span className="form-hint">El cobro entra al turno abierto e impacta el cuadre de caja.</span>
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary"
            disabled={saving || !pagos || totalCobro <= 0 || totalCobro > totalSeleccionado || seleccionadas.length === 0}>
            {saving ? 'Cobrando...'
              : totalCobro >= deudor.saldo ? 'Cobrar todo y saldar cuenta'
              : totalCobro >= totalSeleccionado ? 'Cobrar lo seleccionado'
              : 'Cobro parcial (queda deuda)'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function DeudoresPage() {
  const { data, isLoading, isError } = useDeudores();
  const [filtroHoy, setFiltroHoy] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const items = useMemo(() => (data?.items ?? []) as Deuda[], [data]);
  const resumen = data?.resumen;

  const deudores = useMemo<Deudor[]>(() => {
    const visibles = filtroHoy ? items.filter(d => esDeHoy(d.fecha_fiado)) : items;
    const grupos = new Map<string, Deudor>();
    for (const d of visibles) {
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
  }, [items, filtroHoy]);

  const hoyCount = useMemo(() => items.filter(d => esDeHoy(d.fecha_fiado)).length, [items]);
  const deudorAbierto = deudores.find(d => d.key === abierto) ?? null;

  const onDone = (msg: string) => {
    setMensaje(msg);
    setAbierto(null);
    window.setTimeout(() => setMensaje(null), 5000);
  };

  return (
    <div className="caja-shell">
      <div className="caja-hero">
        <div>
          <span className="caja-kicker">Cuentas por cobrar</span>
          <h1>Deudores</h1>
          <p>Clientes con fiado pendiente. Entra a la cuenta de cada uno para ver el detalle y cobrar.</p>
        </div>
      </div>

      {mensaje && <div className="caja-alert ok">{mensaje}</div>}

      {isLoading ? (
        <div className="caja-skeleton" style={{ minHeight: 200 }} />
      ) : isError ? (
        <EmptyState title="No se pudo cargar deudores" />
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total por cobrar" value={<MoneyText value={resumen?.total_saldo ?? 0} />} highlight />
            <KpiCard label="Deudas pendientes" value={resumen?.cuentas ?? 0} accent="var(--info)" />
            <KpiCard label="Fiados de hoy" value={hoyCount} accent="var(--warning)" />
            <KpiCard label="Vencidas" value={resumen?.vencidas ?? 0} accent="var(--danger)" />
          </div>

          <div className="pay-method-toggle" style={{ marginBottom: 12 }}>
            <button type="button" className={`pay-method-btn ${!filtroHoy ? 'active' : ''}`} onClick={() => setFiltroHoy(false)}>Todos</button>
            <button type="button" className={`pay-method-btn ${filtroHoy ? 'active' : ''}`} onClick={() => setFiltroHoy(true)}>De hoy ({hoyCount})</button>
          </div>

          {deudores.length === 0 ? (
            <EmptyState title={filtroHoy ? 'Sin fiados de hoy' : 'Sin deudas pendientes'} hint="Los fiados aparecerán aquí." />
          ) : (
            <div className="caja-panel">
              <div className="caja-movement-list">
                {deudores.map(g => (
                  <div className="caja-movement" key={g.key} style={{ alignItems: 'center' }}>
                    <span className={`caja-movement-dot ${g.vencidas > 0 ? 'out' : 'in'}`} />
                    <div style={{ flex: 1 }}>
                      <strong>{g.nombre}</strong>
                      <span>
                        {g.telefono ?? 'Sin celular'} · {g.deudas.length} deuda(s)
                        {g.vencidas > 0 && (
                          <span style={{ color: 'var(--danger)', fontWeight: 700 }}> · {g.vencidas} vencida(s)</span>
                        )}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 120 }}>
                      <div className="form-hint">Debe</div>
                      <strong><MoneyText value={g.saldo} /></strong>
                    </div>
                    <button className="admin-btn primary" type="button" onClick={() => setAbierto(g.key)}>Ver cuenta</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {deudorAbierto && (
        <CuentaDeudorModal
          key={deudorAbierto.key}
          deudor={deudorAbierto}
          onClose={() => setAbierto(null)}
          onDone={onDone}
        />
      )}
    </div>
  );
}

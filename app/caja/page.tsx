'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import {
  useAbrirCaja,
  useCerrarCaja,
  useRegistrarGasto,
  useRegistrarIngreso,
  useTurnoActivo,
  type MovimientoManualInput,
} from '@/hooks/caja';
import EmptyState from '@/components/ui/EmptyState';
import KpiCard from '@/components/ui/KpiCard';
import MethodPill from '@/components/ui/MethodPill';
import MoneyText from '@/components/ui/MoneyText';
import StatusBadge from '@/components/ui/StatusBadge';
import { calcularDiferencia, estadoDiferencia } from '@/lib/shared/caja-calc';

type Metodo = 'EFECTIVO' | 'QR' | 'TARJETA';

type Movimiento = {
  id: number;
  concepto: string;
  tipo: string;
  metodo_pago: Metodo;
  monto: string | number;
  categoria?: string | null;
  created_at: string;
};

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function parseMoney(value: string): number {
  return Number(Number(value || '0').toFixed(2));
}

function fmtDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-BO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function movimientoLabel(tipo: string) {
  return tipo.replaceAll('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

export default function CajaHomePage() {
  const turnoQuery = useTurnoActivo();
  const abrirCaja = useAbrirCaja();
  const registrarIngreso = useRegistrarIngreso();
  const registrarGasto = useRegistrarGasto();
  const cerrarCaja = useCerrarCaja();

  const turno = turnoQuery.data;
  const movimientos = (turno?.movimientos ?? []) as Movimiento[];

  const [aperturaEfectivo, setAperturaEfectivo] = useState('0.00');
  const [aperturaQr, setAperturaQr] = useState('0.00');
  const [aperturaObs, setAperturaObs] = useState('');
  const [ingreso, setIngreso] = useState({ concepto: '', monto: '', metodo_pago: 'EFECTIVO' as Metodo, categoria: '' });
  const [gasto, setGasto] = useState({ concepto: '', monto: '', metodo_pago: 'EFECTIVO' as Metodo, categoria: 'Insumos' });
  const [realEfectivo, setRealEfectivo] = useState('');
  const [realQr, setRealQr] = useState('');
  const [cierreObs, setCierreObs] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const totals = useMemo(() => {
    const netoEfectivo = movimientos.filter(m => m.metodo_pago === 'EFECTIVO').reduce((sum, m) => sum + asNumber(m.monto), 0);
    const netoQr = movimientos.filter(m => m.metodo_pago === 'QR').reduce((sum, m) => sum + asNumber(m.monto), 0);
    const netoTarjeta = movimientos.filter(m => m.metodo_pago === 'TARJETA').reduce((sum, m) => sum + asNumber(m.monto), 0);
    const ingresos = movimientos.filter(m => asNumber(m.monto) > 0).reduce((sum, m) => sum + asNumber(m.monto), 0);
    const egresos = Math.abs(movimientos.filter(m => asNumber(m.monto) < 0).reduce((sum, m) => sum + asNumber(m.monto), 0));
    const esperadoEfectivo = asNumber(turno?.apertura_efectivo) + netoEfectivo;
    const esperadoQr = asNumber(turno?.apertura_qr) + netoQr;
    const realEf = parseMoney(realEfectivo);
    const realQ = parseMoney(realQr);

    return {
      netoEfectivo,
      netoQr,
      netoTarjeta,
      ingresos,
      egresos,
      esperadoEfectivo,
      esperadoQr,
      esperadoTotal: esperadoEfectivo + esperadoQr,
      diferenciaEfectivo: realEfectivo ? calcularDiferencia(esperadoEfectivo, realEf) : 0,
      diferenciaQr: realQr ? calcularDiferencia(esperadoQr, realQ) : 0,
      diferenciaTotal: (realEfectivo || realQr)
        ? calcularDiferencia(esperadoEfectivo, realEf) + calcularDiferencia(esperadoQr, realQ)
        : 0,
    };
  }, [movimientos, realEfectivo, realQr, turno]);

  const latest = movimientos.slice(0, 8);
  const cierreStatus = estadoDiferencia(totals.diferenciaTotal);

  const clearMessageSoon = () => window.setTimeout(() => setMessage(null), 4500);

  const submitApertura = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await abrirCaja.mutateAsync({
        apertura_efectivo: parseMoney(aperturaEfectivo),
        apertura_qr: parseMoney(aperturaQr),
        observaciones: aperturaObs.trim() || undefined,
      });
      setMessage({ type: 'ok', text: 'Caja abierta correctamente.' });
      clearMessageSoon();
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'No se pudo abrir caja.';
      setMessage({ type: 'error', text: msg });
    }
  };

  const registrarManual = async (tipo: 'ingreso' | 'gasto', event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const source = tipo === 'ingreso' ? ingreso : gasto;
    const payload: MovimientoManualInput = {
      concepto: source.concepto.trim(),
      monto: parseMoney(source.monto),
      metodo_pago: source.metodo_pago,
      categoria: source.categoria.trim() || undefined,
    };
    if (!payload.concepto || payload.monto <= 0) {
      setMessage({ type: 'error', text: 'Completa concepto y monto mayor a 0.' });
      return;
    }
    try {
      if (tipo === 'ingreso') {
        await registrarIngreso.mutateAsync(payload);
        setIngreso({ concepto: '', monto: '', metodo_pago: 'EFECTIVO', categoria: '' });
      } else {
        await registrarGasto.mutateAsync(payload);
        setGasto({ concepto: '', monto: '', metodo_pago: 'EFECTIVO', categoria: 'Insumos' });
      }
      setMessage({ type: 'ok', text: tipo === 'ingreso' ? 'Ingreso registrado.' : 'Gasto registrado.' });
      clearMessageSoon();
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'No se pudo registrar el movimiento.';
      setMessage({ type: 'error', text: msg });
    }
  };

  const submitCierre = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await cerrarCaja.mutateAsync({
        real_efectivo: parseMoney(realEfectivo),
        real_qr: parseMoney(realQr),
        observaciones: cierreObs.trim() || undefined,
      });
      setRealEfectivo('');
      setRealQr('');
      setCierreObs('');
      setMessage({ type: 'ok', text: 'Caja cerrada correctamente.' });
      clearMessageSoon();
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'No se pudo cerrar caja.';
      setMessage({ type: 'error', text: msg });
    }
  };

  if (turnoQuery.isLoading) {
    return (
      <div className="caja-shell">
        <div className="caja-skeleton hero" />
        <div className="caja-skeleton grid" />
      </div>
    );
  }

  if (turnoQuery.isError) {
    return <EmptyState title="No se pudo cargar caja" hint="Revisa tu sesión e intenta recargar la página." />;
  }

  if (!turno) {
    return (
      <div className="caja-shell">
        <div className="caja-hero">
          <div>
            <span className="caja-kicker">Operación de caja</span>
            <h1>Caja cerrada</h1>
            <p>Abre un turno para registrar ventas, ingresos, gastos y cierre del día.</p>
          </div>
          <StatusBadge status="cerrado" label="Sin turno activo" />
        </div>

        {message && <div className={`caja-alert ${message.type}`}>{message.text}</div>}

        <div className="caja-grid">
          <form className="caja-panel span-7" onSubmit={submitApertura}>
            <div className="caja-panel-head">
              <div>
                <h2>Apertura</h2>
                <p>Registra los saldos iniciales por método.</p>
              </div>
            </div>
            <div className="caja-form-grid">
              <label>
                <span>Efectivo inicial</span>
                <input type="number" min="0" step="0.01" value={aperturaEfectivo} onChange={e => setAperturaEfectivo(e.target.value)} required />
              </label>
              <label>
                <span>QR inicial</span>
                <input type="number" min="0" step="0.01" value={aperturaQr} onChange={e => setAperturaQr(e.target.value)} required />
              </label>
              <label className="full">
                <span>Observaciones</span>
                <textarea rows={4} maxLength={500} value={aperturaObs} onChange={e => setAperturaObs(e.target.value)} />
              </label>
            </div>
            <div className="caja-actions">
              <button className="admin-btn primary" type="submit" disabled={abrirCaja.isPending}>
                {abrirCaja.isPending ? 'Abriendo...' : 'Abrir caja'}
              </button>
            </div>
          </form>

          <aside className="caja-panel span-5">
            <div className="caja-panel-head">
              <div>
                <h2>Accesos</h2>
                <p>Funciones disponibles al abrir turno.</p>
              </div>
            </div>
            <div className="caja-quick-list muted">
              <span>Venta de mostrador</span>
              <span>Ingresos extra</span>
              <span>Gastos operativos</span>
              <span>Movimientos y cierre</span>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="caja-shell">
      <div className="caja-hero active">
        <div>
          <span className="caja-kicker">Turno #{turno.id}</span>
          <h1>Caja abierta</h1>
          <p>Sucursal #{turno.sucursal_id} · apertura {fmtDate(turno.fecha_apertura)}</p>
        </div>
        <div className="caja-hero-actions">
          <StatusBadge status="abierto" label="Operando" />
          <Link className="admin-btn secondary" href="/caja/venta">Nueva venta</Link>
        </div>
      </div>

      {message && <div className={`caja-alert ${message.type}`}>{message.text}</div>}

      <div className="kpi-grid">
        <KpiCard label="Esperado efectivo" value={<MoneyText value={totals.esperadoEfectivo} signed />} highlight />
        <KpiCard label="Esperado QR" value={<MoneyText value={totals.esperadoQr} signed />} accent="var(--info)" />
        <KpiCard label="Ingresos turno" value={<MoneyText value={totals.ingresos} />} accent="var(--fresh)" />
        <KpiCard label="Egresos turno" value={<MoneyText value={totals.egresos} />} accent="var(--danger)" />
      </div>

      <div className="caja-grid">
        <section className="caja-panel span-8">
          <div className="caja-panel-head">
            <div>
              <h2>Movimientos rápidos</h2>
              <p>Registra ingresos extra o gastos sin salir del dashboard.</p>
            </div>
            <Link className="dash-card-link" href="/caja/movimientos">Ver libro</Link>
          </div>

          <div className="caja-forms-two">
            <form onSubmit={(event) => registrarManual('ingreso', event)}>
              <h3>Ingreso</h3>
              <input placeholder="Concepto" value={ingreso.concepto} onChange={e => setIngreso(prev => ({ ...prev, concepto: e.target.value }))} maxLength={200} />
              <div className="caja-inline">
                <input type="number" min="0.01" step="0.01" placeholder="Monto" value={ingreso.monto} onChange={e => setIngreso(prev => ({ ...prev, monto: e.target.value }))} />
                <select value={ingreso.metodo_pago} onChange={e => setIngreso(prev => ({ ...prev, metodo_pago: e.target.value as Metodo }))}>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="QR">QR</option>
                  <option value="TARJETA">Tarjeta</option>
                </select>
              </div>
              <input placeholder="Categoria opcional" value={ingreso.categoria} onChange={e => setIngreso(prev => ({ ...prev, categoria: e.target.value }))} maxLength={100} />
              <button className="admin-btn primary" type="submit" disabled={registrarIngreso.isPending}>
                {registrarIngreso.isPending ? 'Registrando...' : 'Registrar ingreso'}
              </button>
            </form>

            <form onSubmit={(event) => registrarManual('gasto', event)}>
              <h3>Gasto</h3>
              <input placeholder="Concepto" value={gasto.concepto} onChange={e => setGasto(prev => ({ ...prev, concepto: e.target.value }))} maxLength={200} />
              <div className="caja-inline">
                <input type="number" min="0.01" step="0.01" placeholder="Monto" value={gasto.monto} onChange={e => setGasto(prev => ({ ...prev, monto: e.target.value }))} />
                <select value={gasto.metodo_pago} onChange={e => setGasto(prev => ({ ...prev, metodo_pago: e.target.value as Metodo }))}>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="QR">QR</option>
                  <option value="TARJETA">Tarjeta</option>
                </select>
              </div>
              <select value={gasto.categoria} onChange={e => setGasto(prev => ({ ...prev, categoria: e.target.value }))}>
                <option value="Insumos">Insumos</option>
                <option value="Servicios">Servicios</option>
                <option value="Movilidad">Movilidad</option>
                <option value="Otros">Otros</option>
              </select>
              <button className="admin-btn secondary" type="submit" disabled={registrarGasto.isPending}>
                {registrarGasto.isPending ? 'Registrando...' : 'Registrar gasto'}
              </button>
            </form>
          </div>
        </section>

        <aside className="caja-panel span-4">
          <div className="caja-panel-head">
            <div>
              <h2>Cierre</h2>
              <p>Cuenta efectivo y QR antes de cerrar.</p>
            </div>
            {(realEfectivo || realQr) && <StatusBadge status={cierreStatus.status} label={cierreStatus.label} />}
          </div>
          <form className="caja-close-form" onSubmit={submitCierre}>
            <label>
              <span>Real efectivo</span>
              <input type="number" min="0" step="0.01" value={realEfectivo} onChange={e => setRealEfectivo(e.target.value)} required />
            </label>
            <label>
              <span>Real QR</span>
              <input type="number" min="0" step="0.01" value={realQr} onChange={e => setRealQr(e.target.value)} required />
            </label>
            <div className="caja-diff">
              <div><span>Esperado</span><strong><MoneyText value={totals.esperadoTotal} signed /></strong></div>
              <div><span>Diferencia</span><strong><MoneyText value={totals.diferenciaTotal} signed /></strong></div>
            </div>
            <label>
              <span>Observaciones</span>
              <textarea rows={3} maxLength={500} value={cierreObs} onChange={e => setCierreObs(e.target.value)} />
            </label>
            <button className="admin-btn primary" type="submit" disabled={cerrarCaja.isPending}>
              {cerrarCaja.isPending ? 'Cerrando...' : 'Cerrar caja'}
            </button>
          </form>
        </aside>

        <section className="caja-panel span-7">
          <div className="caja-panel-head">
            <div>
              <h2>Libro reciente</h2>
              <p>Ultimos movimientos del turno activo.</p>
            </div>
          </div>
          {latest.length === 0 ? (
            <EmptyState title="Sin movimientos" hint="Las ventas, ingresos y gastos apareceran aqui." />
          ) : (
            <div className="caja-movement-list">
              {latest.map(mov => {
                const amount = asNumber(mov.monto);
                return (
                  <div className="caja-movement" key={mov.id}>
                    <span className={`caja-movement-dot ${amount >= 0 ? 'in' : 'out'}`} />
                    <div>
                      <strong>{mov.concepto}</strong>
                      <span>{movimientoLabel(mov.tipo)} · {new Date(mov.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <MethodPill metodo={mov.metodo_pago} />
                    <MoneyText value={amount} signed />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="caja-panel span-5">
          <div className="caja-panel-head">
            <div>
              <h2>Balance por metodo</h2>
              <p>Neto registrado durante el turno.</p>
            </div>
          </div>
          <div className="caja-balance-list">
            <div><MethodPill metodo="EFECTIVO" /><strong><MoneyText value={totals.netoEfectivo} signed /></strong></div>
            <div><MethodPill metodo="QR" /><strong><MoneyText value={totals.netoQr} signed /></strong></div>
            <div><MethodPill metodo="TARJETA" /><strong><MoneyText value={totals.netoTarjeta} signed /></strong></div>
          </div>
          <div className="caja-quick-actions">
            <Link className="admin-btn secondary" href="/caja/venta">Venta</Link>
            <Link className="admin-btn secondary" href="/caja/historial">Historial</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import StatusBadge from '@/components/ui/StatusBadge';
import ReporteCierre from '@/components/caja/ReporteCierre';
import { useCerrarCaja, useTurnoActivo, useResumenRepartidores } from '@/hooks/caja';

type Movimiento = { metodo_pago: 'EFECTIVO' | 'QR' | 'TARJETA'; monto: string | number };

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function parseMoney(value: string): number {
  return Number(Number(value || '0').toFixed(2));
}

function diffStatus(diff: number) {
  if (diff === 0) return { status: 'cuadra', label: 'Cuadra exacto' };
  if (diff > 0) return { status: 'sobrante', label: 'Sobrante' };
  return { status: 'faltante', label: 'Faltante' };
}

export default function CierreCajaPage() {
  const { data: turno, isLoading, isError } = useTurnoActivo();
  const { data: repartidoresData } = useResumenRepartidores();
  const cerrarCaja = useCerrarCaja();
  const repartidores = repartidoresData?.repartidores ?? [];
  const [realEfectivo, setRealEfectivo] = useState('');
  const [realQr, setRealQr] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [cierre, setCierre] = useState<typeof turno | null>(null);

  const esperado = useMemo(() => {
    const movimientos = (turno?.movimientos ?? []) as Movimiento[];
    const netoEfectivo = movimientos.filter(m => m.metodo_pago === 'EFECTIVO').reduce((sum, m) => sum + asNumber(m.monto), 0);
    const netoQr = movimientos.filter(m => m.metodo_pago === 'QR').reduce((sum, m) => sum + asNumber(m.monto), 0);
    return {
      efectivo: asNumber(turno?.apertura_efectivo) + netoEfectivo,
      qr: asNumber(turno?.apertura_qr) + netoQr,
    };
  }, [turno]);

  const real = { efectivo: parseMoney(realEfectivo), qr: parseMoney(realQr) };
  const diff = { efectivo: real.efectivo - esperado.efectivo, qr: real.qr - esperado.qr };
  const totalDiff = diff.efectivo + diff.qr;
  const totalStatus = diffStatus(totalDiff);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setConfirmOpen(true);
  };

  const confirm = async () => {
    try {
      const result = await cerrarCaja.mutateAsync({
        real_efectivo: real.efectivo,
        real_qr: real.qr,
        observaciones: observaciones.trim() || undefined,
      });
      setCierre(result);
      setConfirmOpen(false);
    } catch {
      setConfirmOpen(false);
      setMessage('No se pudo cerrar caja.');
    }
  };

  if (isLoading) return <div className="dash-card span-12" style={{ minHeight: 220 }} />;
  if (isError) return <EmptyState title="No se pudo cargar el turno" />;
  if (!turno) return <EmptyState title="No hay turno abierto" hint="Abre caja antes de cerrar." />;

  if (cierre) {
    return (
      <div>
        <div className="admin-page-header">
          <div>
            <h1>Cierre completado</h1>
            <p>El turno fue cerrado correctamente.</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link className="admin-btn secondary" href="/caja/historial">Historial</Link>
          </div>
        </div>
        <ReporteCierre cierre={cierre} />
      </div>
    );
  }

  return (
    <div>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirm}
        title="Confirmar cierre"
        description={`Diferencia total: Bs ${totalDiff.toFixed(2)}. El cierre no se puede editar desde esta pantalla.`}
        confirmLabel="Cerrar caja"
        isLoading={cerrarCaja.isPending}
      />
      <div className="admin-page-header">
        <div>
          <h1>Cierre de caja</h1>
          <p>Cuenta efectivo y QR antes de cerrar el turno.</p>
        </div>
        <StatusBadge status={totalStatus.status} label={totalStatus.label} />
      </div>

      <div className="kpi-grid">
        <KpiCard label="Esperado efectivo" value={<MoneyText value={esperado.efectivo} />} highlight />
        <KpiCard label="Esperado QR" value={<MoneyText value={esperado.qr} />} accent="var(--info)" />
        <KpiCard label="Diferencia efectivo" value={<MoneyText value={diff.efectivo} signed />} accent={diff.efectivo < 0 ? 'var(--danger)' : 'var(--fresh)'} />
        <KpiCard label="Diferencia QR" value={<MoneyText value={diff.qr} signed />} accent={diff.qr < 0 ? 'var(--danger)' : 'var(--fresh)'} />
      </div>

      {repartidores.length > 0 && (
        <div className="dash-card span-12" style={{ marginBottom: 18 }}>
          <div className="dash-card-header">
            <h3>Conciliación de repartidores</h3>
            <span className="dash-card-sub">pedidos de delivery de este turno</span>
          </div>
          <table className="admin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Repartidor</th>
                <th className="num">Pedidos</th>
                <th className="num">En curso</th>
                <th className="num">Entregados</th>
                <th className="num">Efectivo adelantado</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {repartidores.map(r => (
                <tr key={r.repartidor}>
                  <td>{r.repartidor}</td>
                  <td className="num">{r.pedidos}</td>
                  <td className="num">{r.en_curso}</td>
                  <td className="num">{r.entregados}</td>
                  <td className="num"><MoneyText value={r.efectivo_adelantado} /></td>
                  <td className="num"><MoneyText value={r.total} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="form-hint" style={{ marginTop: 8 }}>
            El efectivo adelantado por cada repartidor ya está incluido en el efectivo esperado del turno.
          </p>
        </div>
      )}

      <form className="dash-card span-8" onSubmit={submit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Real efectivo</label>
            <input type="number" min="0" step="0.01" value={realEfectivo} onChange={e => setRealEfectivo(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Real QR</label>
            <input type="number" min="0" step="0.01" value={realQr} onChange={e => setRealQr(e.target.value)} required />
          </div>
          <div className="form-group full">
            <label>Observaciones</label>
            <textarea rows={4} value={observaciones} maxLength={500} onChange={e => setObservaciones(e.target.value)} />
          </div>
        </div>
        {message && <p className="form-hint" style={{ marginTop: 14 }}>{message}</p>}
        <div className="admin-modal-footer" style={{ paddingInline: 0, paddingBottom: 0 }}>
          <button className="admin-btn primary" type="submit" disabled={cerrarCaja.isPending}>Cerrar caja</button>
        </div>
      </form>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTurnoActivo } from '@/hooks/caja';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';

type Movimiento = {
  metodo_pago: 'EFECTIVO' | 'QR' | 'TARJETA';
  monto: string | number;
};

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return <Link className="admin-btn secondary" href={href}>{label}</Link>;
}

export default function CajaHomePage() {
  const { data: turno, isLoading, isError } = useTurnoActivo();

  const totals = useMemo(() => {
    const movimientos = (turno?.movimientos ?? []) as Movimiento[];
    const netoEfectivo = movimientos
      .filter(m => m.metodo_pago === 'EFECTIVO')
      .reduce((sum, m) => sum + asNumber(m.monto), 0);
    const netoQr = movimientos
      .filter(m => m.metodo_pago === 'QR')
      .reduce((sum, m) => sum + asNumber(m.monto), 0);
    return {
      esperadoEfectivo: asNumber(turno?.apertura_efectivo) + netoEfectivo,
      esperadoQr: asNumber(turno?.apertura_qr) + netoQr,
    };
  }, [turno]);

  if (isLoading) {
    return (
      <div className="dashboard-grid">
        {[1, 2, 3, 4].map(i => <div key={i} className="dash-card span-6" style={{ minHeight: 130, opacity: 0.65 }} />)}
      </div>
    );
  }

  if (isError) {
    return <EmptyState title="No se pudo cargar caja" hint="Revisa tu sesión e intenta recargar la página." />;
  }

  if (!turno) {
    return (
      <div>
        <div className="admin-page-header">
          <div>
            <h1>Caja cerrada</h1>
            <p>Abre un turno para registrar ventas, ingresos y gastos.</p>
          </div>
          <Link className="admin-btn primary" href="/caja/apertura">Abrir caja</Link>
        </div>
        <div className="dash-card span-12">
          <EmptyState title="Sin turno activo" hint="Cuando abras caja verás el resumen operativo del turno." />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1>Caja</h1>
          <p>
            Caja abierta · Sucursal #{turno.sucursal_id} · turno iniciado{' '}
            {new Date(turno.fecha_apertura).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusBadge status="abierto" label="Abierto" />
          <Link className="admin-btn primary" href="/caja/cierre">Cerrar caja</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Apertura efectivo" value={<MoneyText value={turno.apertura_efectivo} />} highlight />
        <KpiCard label="Apertura QR" value={<MoneyText value={turno.apertura_qr} />} accent="var(--info)" />
        <KpiCard label="Ventas efectivo" value={<MoneyText value={turno.ventas_efectivo} />} accent="var(--fresh)" />
        <KpiCard label="Ventas QR" value={<MoneyText value={turno.ventas_qr} />} accent="var(--info)" />
        <KpiCard label="Esperado efectivo" value={<MoneyText value={totals.esperadoEfectivo} />} highlight accent="var(--fresh)" />
        <KpiCard label="Esperado QR" value={<MoneyText value={totals.esperadoQr} />} accent="var(--info)" />
      </div>

      <div className="dash-card span-12">
        <div className="dash-card-header">
          <h3>Accesos rápidos</h3>
          <span className="dash-card-sub">Operación de mostrador</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <QuickLink href="/caja/venta" label="Venta" />
          <QuickLink href="/caja/ingreso" label="Ingreso" />
          <QuickLink href="/caja/gasto" label="Gasto" />
          <QuickLink href="/caja/movimientos" label="Movimientos" />
        </div>
      </div>
    </div>
  );
}

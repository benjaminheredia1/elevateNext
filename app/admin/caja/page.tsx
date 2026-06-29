'use client';

import { useMemo, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import { useTurnos, type RangoState } from '@/hooks/finanzas';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import RangeFilter from '@/components/ui/RangeFilter';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';

function estadoDiferencia(value: number) {
  if (Math.abs(value) < 0.01) return { status: 'cuadra', label: 'Cuadra' };
  if (value < 0) return { status: 'faltante', label: 'Faltante' };
  return { status: 'sobrante', label: 'Sobrante' };
}

function fmtDate(value: string) {
  return new Date(value).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminCajaPage() {
  const [rango, setRango] = useState<RangoState>({ rango: 'mes' });
  const turnos = useTurnos(rango);
  const rows = turnos.data?.turnos ?? [];

  const resumen = useMemo(() => rows.reduce((acc: any, row: any) => {
    const ventas = Number(row.ventas_efectivo ?? 0) + Number(row.ventas_qr ?? 0);
    const esperado = Number(row.esperado_efectivo ?? 0) + Number(row.esperado_qr ?? 0);
    const real = Number(row.real_efectivo ?? 0) + Number(row.real_qr ?? 0);
    acc.turnos += 1;
    acc.abiertos += row.estado === 'ABIERTO' ? 1 : 0;
    acc.ventas += ventas;
    acc.esperado += esperado;
    acc.real += real;
    acc.diferencia += Number(row.diferencia_total ?? 0);
    return acc;
  }, { turnos: 0, abiertos: 0, ventas: 0, esperado: 0, real: 0, diferencia: 0 }), [rows]);

  const latest = rows.slice(0, 5);

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <span className="admin-badge">Finanzas</span>
          <h1>Caja</h1>
          <p>Supervisión de turnos, ventas registradas y diferencias de cierre.</p>
        </div>
        <RangeFilter value={rango} onChange={setRango} />
      </div>

      {turnos.isLoading ? <EmptyState title="Cargando turnos..." /> : turnos.isError ? <EmptyState title="No se pudo cargar turnos" /> : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Turnos" value={resumen.turnos} highlight />
            <KpiCard label="Abiertos" value={resumen.abiertos} accent="var(--fresh)" />
            <KpiCard label="Ventas" value={<MoneyText value={resumen.ventas} />} accent="var(--info)" />
            <KpiCard label="Diferencia" value={<MoneyText value={resumen.diferencia} signed />} accent={Math.abs(resumen.diferencia) < 0.01 ? 'var(--fresh)' : 'var(--amber)'} />
          </div>

          <div className="finance-split">
            <div>
              <DataTable
                data={rows}
                emptyTitle="Sin turnos en el periodo"
                rowKey={(row: any) => row.id}
                columns={[
                  { key: 'id', header: 'Turno', render: (row: any) => <strong>#{row.id}</strong> },
                  { key: 'estado', header: 'Estado', render: (row: any) => <StatusBadge status={String(row.estado).toLowerCase()} label={row.estado} /> },
                  { key: 'cajero', header: 'Cajero', render: (row: any) => row.cajero?.nombre ?? row.cajero?.email ?? '-' },
                  { key: 'apertura', header: 'Apertura', render: (row: any) => fmtDate(row.fecha_apertura) },
                  { key: 'ventas', header: 'Ventas', className: 'num', render: (row: any) => <MoneyText value={Number(row.ventas_efectivo ?? 0) + Number(row.ventas_qr ?? 0)} /> },
                  { key: 'esperado', header: 'Esperado', className: 'num', render: (row: any) => <MoneyText value={Number(row.esperado_efectivo ?? 0) + Number(row.esperado_qr ?? 0)} /> },
                  { key: 'real', header: 'Real', className: 'num', render: (row: any) => <MoneyText value={Number(row.real_efectivo ?? 0) + Number(row.real_qr ?? 0)} /> },
                  {
                    key: 'diferencia',
                    header: 'Diferencia',
                    className: 'num',
                    render: (row: any) => {
                      const diff = Number(row.diferencia_total ?? 0);
                      const meta = estadoDiferencia(diff);
                      return <StatusBadge status={meta.status} label={`${meta.label} Bs ${Math.abs(diff).toFixed(2)}`} />;
                    },
                  },
                ]}
              />
            </div>

            <aside className="finance-panel span-12">
              <div className="finance-panel-header">
                <div>
                  <h3>Resumen de control</h3>
                  <p>Comparación del efectivo/QR esperado contra lo declarado.</p>
                </div>
              </div>
              <div className="finance-list">
                <div className="finance-row"><span>Esperado</span><strong><MoneyText value={resumen.esperado} /></strong></div>
                <div className="finance-row"><span>Declarado</span><strong><MoneyText value={resumen.real} /></strong></div>
                <div className="finance-row"><span>Diferencia total</span><strong><MoneyText value={resumen.diferencia} signed /></strong></div>
              </div>

              <div className="finance-panel-header" style={{ marginTop: 22 }}>
                <div>
                  <h3>Últimos turnos</h3>
                  <p>Actividad reciente del periodo seleccionado.</p>
                </div>
              </div>
              <div className="finance-timeline">
                {latest.length === 0 ? (
                  <EmptyState title="Sin actividad" hint="No hay turnos para mostrar." />
                ) : latest.map((turno: any) => {
                  const diff = Number(turno.diferencia_total ?? 0);
                  const ventas = Number(turno.ventas_efectivo ?? 0) + Number(turno.ventas_qr ?? 0);
                  return (
                    <div className="finance-timeline-item" key={turno.id}>
                      <span className={`finance-dot ${Math.abs(diff) < 0.01 ? 'in' : 'out'}`} />
                      <div>
                        <div className="finance-timeline-title">Turno #{turno.id}</div>
                        <div className="finance-timeline-sub">{turno.cajero?.nombre ?? turno.cajero?.email ?? 'Sin cajero'} · {fmtDate(turno.fecha_apertura)}</div>
                      </div>
                      <span className="finance-amount"><MoneyText value={ventas} /></span>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        </>
      )}
    </AdminPanel>
  );
}

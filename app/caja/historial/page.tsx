'use client';

import EmptyState from '@/components/ui/EmptyState';
import MoneyText from '@/components/ui/MoneyText';
import StatusBadge from '@/components/ui/StatusBadge';
import { useHistorial } from '@/hooks/caja';

interface Turno {
  id: number;
  fecha_apertura: string;
  fecha_cierre?: string | null;
  ventas_efectivo: string | number;
  ventas_qr: string | number;
  diferencia_efectivo?: string | number | null;
  diferencia_qr?: string | number | null;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function duration(start: string, end?: string | null) {
  if (!end) return '—';
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function statusFor(diff: number) {
  if (diff === 0) return { status: 'cuadra', label: 'Cuadra' };
  if (diff > 0) return { status: 'sobrante', label: 'Sobrante' };
  return { status: 'faltante', label: 'Faltante' };
}

export default function HistorialCajaPage() {
  const { data, isLoading, isError } = useHistorial();
  const turnos = (data ?? []) as Turno[];

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1>Historial</h1>
          <p>Turnos cerrados por el cajero.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="dash-card span-12" style={{ minHeight: 200 }} />
      ) : isError ? (
        <EmptyState title="No se pudo cargar historial" />
      ) : turnos.length === 0 ? (
        <EmptyState title="Sin cierres" hint="Los turnos cerrados aparecerán aquí." />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Turno</th>
                <th>Apertura</th>
                <th>Cierre</th>
                <th>Duración</th>
                <th className="num">Ventas</th>
                <th className="num">Diferencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {turnos.map(turno => {
                const ventas = asNumber(turno.ventas_efectivo) + asNumber(turno.ventas_qr);
                const diff = asNumber(turno.diferencia_efectivo) + asNumber(turno.diferencia_qr);
                const meta = statusFor(diff);
                return (
                  <tr key={turno.id}>
                    <td>#{turno.id}</td>
                    <td>{new Date(turno.fecha_apertura).toLocaleString('es-BO')}</td>
                    <td>{turno.fecha_cierre ? new Date(turno.fecha_cierre).toLocaleString('es-BO') : '—'}</td>
                    <td>{duration(turno.fecha_apertura, turno.fecha_cierre)}</td>
                    <td className="num"><MoneyText value={ventas} /></td>
                    <td className="num"><MoneyText value={diff} signed /></td>
                    <td><StatusBadge status={meta.status} label={meta.label} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

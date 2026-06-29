'use client';

import MoneyText from '@/components/ui/MoneyText';

interface ReporteCierreProps {
  cierre: {
    id: number;
    fecha_apertura: string;
    fecha_cierre?: string | null;
    apertura_efectivo: string | number;
    apertura_qr: string | number;
    ventas_efectivo: string | number;
    ventas_qr: string | number;
    esperado_efectivo?: string | number | null;
    esperado_qr?: string | number | null;
    real_efectivo?: string | number | null;
    real_qr?: string | number | null;
    diferencia_efectivo?: string | number | null;
    diferencia_qr?: string | number | null;
    observaciones?: string | null;
  };
  responsable?: string;
}

function minutesBetween(start: string, end?: string | null) {
  if (!end) return '—';
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

export default function ReporteCierre({ cierre, responsable = 'Cajero' }: ReporteCierreProps) {
  return (
    <section className="dash-card span-12 reporte-cierre">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .reporte-cierre, .reporte-cierre * { visibility: visible; }
          .reporte-cierre { position: absolute; left: 0; top: 0; width: 100%; background: #fff !important; color: #111 !important; border: none !important; box-shadow: none !important; }
          .reporte-cierre button { display: none !important; }
        }
      `}</style>
      <div className="dash-card-header">
        <div>
          <h3>Reporte de cierre #{cierre.id}</h3>
          <span className="dash-card-sub">Responsable: {responsable}</span>
        </div>
        <button className="admin-btn secondary" type="button" onClick={() => window.print()}>Imprimir</button>
      </div>

      <div className="review-stats">
        <div className="review-stat"><div className="review-stat-label">Apertura</div><div className="review-stat-val">{new Date(cierre.fecha_apertura).toLocaleString('es-BO')}</div></div>
        <div className="review-stat"><div className="review-stat-label">Duración</div><div className="review-stat-val">{minutesBetween(cierre.fecha_apertura, cierre.fecha_cierre)}</div></div>
        <div className="review-stat"><div className="review-stat-label">Ventas efectivo</div><div className="review-stat-val"><MoneyText value={cierre.ventas_efectivo} /></div></div>
        <div className="review-stat"><div className="review-stat-label">Ventas QR</div><div className="review-stat-val"><MoneyText value={cierre.ventas_qr} /></div></div>
        <div className="review-stat"><div className="review-stat-label">Esperado efectivo</div><div className="review-stat-val"><MoneyText value={cierre.esperado_efectivo ?? 0} /></div></div>
        <div className="review-stat"><div className="review-stat-label">Real efectivo</div><div className="review-stat-val"><MoneyText value={cierre.real_efectivo ?? 0} /></div></div>
        <div className="review-stat"><div className="review-stat-label">Diferencia efectivo</div><div className="review-stat-val"><MoneyText value={cierre.diferencia_efectivo ?? 0} signed /></div></div>
        <div className="review-stat"><div className="review-stat-label">Diferencia QR</div><div className="review-stat-val"><MoneyText value={cierre.diferencia_qr ?? 0} signed /></div></div>
      </div>

      {cierre.observaciones && <p className="form-hint" style={{ marginTop: 16 }}>Observaciones: {cierre.observaciones}</p>}
      <button className="admin-btn ghost" type="button" disabled title="Próximamente" style={{ marginTop: 16 }}>Enviar resumen</button>
    </section>
  );
}

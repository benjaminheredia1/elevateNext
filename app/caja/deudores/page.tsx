'use client';

import { FormEvent, useMemo, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import { useCobrarDeuda, useDeudores } from '@/hooks/caja';

interface Deuda {
  id: number;
  contraparte: string;
  concepto: string;
  cliente?: { id: number; nombre: string; telefono: string | null } | null;
  monto: number;
  monto_pagado: number;
  saldo: number;
  estado: string;
  vencimiento: string | null;
  vencido: boolean;
}

function fmtDate(value: string | null) {
  if (!value) return 'Sin vencimiento';
  return new Date(value).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CobrarModal({ deuda, onClose, onSubmit, saving }: {
  deuda: Deuda;
  onClose: () => void;
  onSubmit: (monto: number, metodo: 'EFECTIVO' | 'QR') => void;
  saving: boolean;
}) {
  const [monto, setMonto] = useState(deuda.saldo);
  const [metodo, setMetodo] = useState<'EFECTIVO' | 'QR'>('EFECTIVO');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (monto <= 0 || monto > deuda.saldo) return;
    onSubmit(monto, metodo);
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal compact" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h2>Cobrar deuda</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="admin-modal-body">
          <div className="finance-modal-note">
            {deuda.contraparte} · Saldo pendiente: <strong><MoneyText value={deuda.saldo} /></strong>
          </div>
          <div className="form-group">
            <label>Monto a cobrar (Bs)</label>
            <input
              type="number"
              min="0.01"
              max={deuda.saldo}
              step="0.01"
              value={monto || ''}
              onChange={e => setMonto(Number(e.target.value))}
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label>Método de pago</label>
            <div className="pay-method-toggle">
              <button type="button" className={`pay-method-btn ${metodo === 'EFECTIVO' ? 'active' : ''}`} onClick={() => setMetodo('EFECTIVO')}>Efectivo</button>
              <button type="button" className={`pay-method-btn ${metodo === 'QR' ? 'active' : ''}`} onClick={() => setMetodo('QR')}>QR</button>
            </div>
          </div>
          <span className="form-hint">El cobro entra al turno abierto e impacta el cuadre de caja.</span>
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? 'Cobrando...' : 'Confirmar cobro'}</button>
        </div>
      </form>
    </div>
  );
}

export default function DeudoresPage() {
  const { data, isLoading, isError } = useDeudores();
  const cobrar = useCobrarDeuda();
  const [cobrando, setCobrando] = useState<Deuda | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const items = useMemo(() => (data?.items ?? []) as Deuda[], [data]);
  const resumen = data?.resumen;

  const doCobro = (monto: number, metodo: 'EFECTIVO' | 'QR') => {
    if (!cobrando) return;
    cobrar.mutate(
      { id: cobrando.id, monto, metodo_pago: metodo },
      {
        onSuccess: () => { setMensaje('Cobro registrado correctamente.'); setCobrando(null); window.setTimeout(() => setMensaje(null), 4000); },
        onError: () => setMensaje('No se pudo registrar el cobro. ¿Hay caja abierta?'),
      },
    );
  };

  return (
    <div className="caja-shell">
      <div className="caja-hero">
        <div>
          <span className="caja-kicker">Cuentas por cobrar</span>
          <h1>Deudores</h1>
          <p>Clientes con fiado pendiente. Cobra aquí cuando paguen.</p>
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
            <KpiCard label="Clientes con deuda" value={resumen?.cuentas ?? 0} accent="var(--info)" />
            <KpiCard label="Vencidas" value={resumen?.vencidas ?? 0} accent="var(--danger)" />
          </div>

          {items.length === 0 ? (
            <EmptyState title="Sin deudas pendientes" hint="Los fiados aparecerán aquí." />
          ) : (
            <div className="caja-panel">
              <div className="caja-movement-list">
                {items.map(d => (
                  <div className="caja-movement" key={d.id} style={{ alignItems: 'center' }}>
                    <span className={`caja-movement-dot ${d.vencido ? 'out' : 'in'}`} />
                    <div style={{ flex: 1 }}>
                      <strong>{d.cliente?.nombre ?? d.contraparte}</strong>
                      <span>
                        {d.cliente?.telefono ?? 'Sin celular'} · {d.concepto}
                        {' · '}
                        <span style={d.vencido ? { color: 'var(--danger)', fontWeight: 700 } : {}}>
                          Vence: {fmtDate(d.vencimiento)}{d.vencido ? ' (vencida)' : ''}
                        </span>
                      </span>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 120 }}>
                      <div className="form-hint">Saldo</div>
                      <strong><MoneyText value={d.saldo} /></strong>
                    </div>
                    <button className="admin-btn primary" type="button" onClick={() => setCobrando(d)}>Cobrar</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {cobrando && (
        <CobrarModal
          deuda={cobrando}
          onClose={() => setCobrando(null)}
          onSubmit={doCobro}
          saving={cobrar.isPending}
        />
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import CuentaDeudorModal, { agruparDeudores, esDeHoy, type Deuda } from '@/components/caja/CuentaDeudorModal';
import { useDeudores } from '@/hooks/caja';

export default function DeudoresPage() {
  const { data, isLoading, isError } = useDeudores();
  const [filtroHoy, setFiltroHoy] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const items = useMemo(() => (data?.items ?? []) as Deuda[], [data]);
  const resumen = data?.resumen;

  const deudores = useMemo(
    () => agruparDeudores(filtroHoy ? items.filter(d => esDeHoy(d.fecha_fiado)) : items),
    [items, filtroHoy],
  );

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

'use client';

import { useState } from 'react';
import apiClient from '@/hooks/api';

const PAYMENT_LABEL: Record<string, string> = {
  PENDIENTE: 'Pago pendiente',
  PAGADO: 'Pagado',
  REEMBOLSADO: 'Reembolsado',
  COD_PENDIENTE: 'Cobro contra entrega',
};

function money(v: number) {
  return `Bs. ${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v || 0))}`;
}

export default function CajaEntregarPage() {
  const [codigo, setCodigo] = useState('');
  const [pedido, setPedido] = useState<any>(null);
  const [driver, setDriver] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const reset = () => { setPedido(null); setDriver(''); setError(''); setOk(''); };

  const buscar = async () => {
    if (!codigo.trim()) return;
    setBuscando(true); reset();
    try {
      const res = await apiClient.get(`/api/caja/pedido?codigo=${encodeURIComponent(codigo.trim())}`);
      setPedido(res.data?.data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.response?.data?.error ?? 'No se encontró el pedido');
    } finally { setBuscando(false); }
  };

  const entregar = async () => {
    setProcesando(true); setError(''); setOk('');
    try {
      const res = await apiClient.post('/api/caja/entregar', { codigo: pedido.codigo, driver_nombre: driver || undefined });
      const tipo = res.data?.data?.tipo_entrega;
      setOk(tipo === 'DELIVERY' ? '✓ Salida registrada. Pedido EN CAMINO.' : '✓ Pedido entregado.');
      setPedido(null); setCodigo(''); setDriver('');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.response?.data?.error ?? 'No se pudo registrar la entrega');
    } finally { setProcesando(false); }
  };

  const isDelivery = pedido?.tipo_entrega === 'DELIVERY';
  const estaListo = pedido?.estado === 'LISTO';
  const cerrado = pedido?.estado === 'ENTREGADO' || pedido?.estado === 'CANCELADO';
  const requiereCobro = isDelivery ? pedido?.payment_status === 'COD_PENDIENTE' : pedido?.payment_status !== 'PAGADO';
  const puedeEntregar = estaListo && !cerrado && (!isDelivery || driver.trim().length > 0);

  return (
    <div className="admin-orders">
      <div className="admin-page-header">
        <div>
          <h1>Entregar pedido</h1>
          <p>Verifica el código y autoriza la salida o entrega.</p>
        </div>
      </div>

      <div className="admin-toolbar" style={{ gap: 10 }}>
        <input
          placeholder="Código del pedido (ej. A7K2P)"
          value={codigo}
          onChange={e => setCodigo(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') buscar(); }}
          className="admin-search-field"
          style={{ textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 }}
        />
        <button className="admin-btn primary" onClick={buscar} disabled={buscando || !codigo.trim()}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {error && <div className="gate-warning" style={{ marginTop: 12 }}>{error}</div>}
      {ok && <div className="gate-warning" style={{ marginTop: 12, background: 'rgba(31,169,113,.12)', borderColor: 'rgba(31,169,113,.35)', color: 'var(--fresh)' }}>{ok}</div>}

      {pedido && (
        <div className="dash-card span-12" style={{ marginTop: 16, padding: 18 }}>
          <div className="dash-card-header">
            <h3>Pedido #{pedido.id} · {isDelivery ? '🛵 Delivery' : '🏪 Recoger en local'}</h3>
            <span className="dash-card-sub">{money(pedido.total)}</span>
          </div>

          <div className="ocd-meta" style={{ marginTop: 8 }}>
            <div className="ocd-meta-item"><span className="ocd-meta-label">Cliente</span><span>{pedido.cliente_nombre ?? 'Sin nombre'}</span></div>
            <div className="ocd-meta-item"><span className="ocd-meta-label">Teléfono</span><span>{pedido.cliente_telefono ?? '—'}</span></div>
            {isDelivery && <div className="ocd-meta-item"><span className="ocd-meta-label">Dirección</span><span>{pedido.cliente_direccion ?? '—'}</span></div>}
          </div>

          <div className="ocd-items" style={{ marginTop: 12 }}>
            {pedido.transaccionesDetalles_id?.map((d: any) => (
              <div key={d.id} className="ocd-item">
                <span className="ocd-item-name">{d.producto?.nombre}</span>
                <span className="ocd-item-qty">x{d.cantidad}</span>
                <span className="ocd-item-price">{money(d.precio_unitario * d.cantidad)}</span>
              </div>
            ))}
          </div>

          {/* Checklist de verificación */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            <div>{estaListo ? '✅' : '❌'} Estado: <strong>{pedido.estado}</strong> {estaListo ? '' : '(debe estar LISTO)'}</div>
            <div>{pedido.payment_status === 'PAGADO' ? '✅' : 'ℹ️'} Pago: <strong>{PAYMENT_LABEL[pedido.payment_status] ?? pedido.payment_status}</strong></div>
            {requiereCobro && (
              <div style={{ color: 'var(--amber)' }}>
                {isDelivery
                  ? `El repartidor debe adelantar ${money(pedido.total)} en efectivo a caja.`
                  : `Cobra ${money(pedido.total)} en mostrador antes de entregar.`}
              </div>
            )}
          </div>

          {isDelivery && (
            <div className="form-group" style={{ marginTop: 12, maxWidth: 320 }}>
              <label>Repartidor que retira</label>
              <input value={driver} onChange={e => setDriver(e.target.value)} placeholder="Nombre del repartidor" />
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button className="admin-btn primary" onClick={entregar} disabled={procesando || !puedeEntregar}>
              {procesando ? 'Registrando…' : isDelivery
                ? (requiereCobro ? `Registrar salida · repartidor paga ${money(pedido.total)}` : 'Registrar salida del repartidor')
                : (requiereCobro ? `Cobrar y entregar ${money(pedido.total)}` : 'Confirmar entrega')}
            </button>
            {!estaListo && !cerrado && <p className="form-hint" style={{ marginTop: 8 }}>El pedido aún no está LISTO. Márcalo listo en la sección Pedidos.</p>}
            {cerrado && <p className="form-hint" style={{ marginTop: 8 }}>Este pedido ya está cerrado ({pedido.estado}).</p>}
          </div>
        </div>
      )}
    </div>
  );
}

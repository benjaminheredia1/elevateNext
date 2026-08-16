'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/hooks/api';
import MoneyText from '@/components/ui/MoneyText';
import MethodPill from '@/components/ui/MethodPill';
import EmptyState from '@/components/ui/EmptyState';
import BotonRecibo from '@/components/ui/BotonRecibo';
import { useLocalesRecibo } from '@/hooks/recibo';
import { desdeDetalleAdmin, type DetalleAdminRecibo } from '@/lib/recibo/adaptadores';

const PAYMENT_METHODS = ['EFECTIVO', 'QR', 'TARJETA'] as const;

export function renderMetodo(metodo: string) {
  return PAYMENT_METHODS.includes(metodo as any) ? <MethodPill metodo={metodo as any} /> : <span>{metodo}</span>;
}

/**
 * Etiquetas visibles del canal de venta. El valor en base de datos sigue siendo
 * SALON; aquí se muestra como "Caja", que es como lo llama el negocio.
 */
const CANAL_LABEL: Record<string, string> = {
  SALON: 'Caja',
  WEB: 'Web · Delivery',
  PICKUP: 'Web · Recojo',
};

function fechaLarga(value: string) {
  return new Date(value).toLocaleString('es-BO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Detalle de la venta asociada a un movimiento de caja: cliente, productos,
 * precios y totales. Se carga al abrirse, no con la lista de movimientos.
 */
export default function VentaDetalleModal({ transaccionId, onClose }: { transaccionId: number; onClose: () => void }) {
  const [venta, setVenta] = useState<any | null>(null);
  const [error, setError] = useState('');
  // Reimpresión desde el panel: es la única pantalla que llega a una venta
  // vieja de cualquier turno filtrando por fecha y sucursal.
  const { localDe } = useLocalesRecibo();

  useEffect(() => {
    let cancelado = false;
    setVenta(null);
    setError('');
    apiClient.get(`/api/admin/transacciones/${transaccionId}`)
      .then(res => { if (!cancelado) setVenta(res.data); })
      .catch(e => { if (!cancelado) setError(e?.response?.data?.error ?? 'No se pudo cargar el detalle de la venta.'); });
    return () => { cancelado = true; };
  }, [transaccionId]);

  const titulo = venta?.codigo ?? (venta?.numero_turno ? `Pedido #${venta.numero_turno}` : `Venta #${transaccionId}`);

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal venta-detalle-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2>{venta ? titulo : 'Detalle de venta'}</h2>
            {venta && <p className="form-hint">{fechaLarga(venta.created_at)}{venta.atendio ? ` · Atendió ${venta.atendio}` : ''}</p>}
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="admin-modal-body">
          {error ? (
            <div className="gate-warning">{error}</div>
          ) : !venta ? (
            <EmptyState title="Cargando detalle..." />
          ) : (
            <>
              <div className="venta-detalle-meta">
                <div><span className="dim">Cliente:</span> <strong>{venta.cliente?.nombre ?? 'Consumidor final'}</strong></div>
                <div><span className="dim">Celular:</span> {venta.cliente?.telefono ?? '—'}</div>
                <div><span className="dim">NIT / C.I.:</span> {venta.cliente?.nit ?? '—'}</div>
                <div><span className="dim">Dirección:</span> {venta.cliente?.direccion ?? '—'}</div>
                <div><span className="dim">Método de pago:</span> {venta.metodo_pago ? renderMetodo(venta.metodo_pago) : '—'}</div>
                <div><span className="dim">Canal:</span> {venta.canal ? (CANAL_LABEL[venta.canal] ?? venta.canal) : '—'}</div>
                {/* El "Pedido #N" del título es el correlativo dentro del turno y
                    se repite en cada apertura de caja: sin decir de qué turno es,
                    no se puede ubicar la venta en el arqueo. Los pedidos web no
                    pasan por caja y no tienen turno. */}
                <div><span className="dim">Turno de caja:</span> {venta.turno_id ? `#${venta.turno_id}` : '—'}</div>
                <div><span className="dim">Entrega:</span> {venta.tipo_entrega ?? '—'}</div>
                <div><span className="dim">Estado:</span> {venta.estado} · pago {venta.payment_status}</div>
                {venta.es_cortesia && <div><span className="dim">Cortesía:</span> <strong>Sí</strong></div>}
                {venta.codigo_descuento && <div><span className="dim">Descuento:</span> {venta.codigo_descuento}</div>}
              </div>

              <table className="admin-table venta-detalle-items">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="num">Cant.</th>
                    <th className="num">P. unit.</th>
                    <th className="num">Desc.</th>
                    <th className="num">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {venta.items.length === 0 ? (
                    <tr><td colSpan={5} className="admin-cell-muted">Esta venta no tiene productos registrados.</td></tr>
                  ) : venta.items.map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.nombre}</td>
                      <td className="num">{item.cantidad}</td>
                      <td className="num"><MoneyText value={item.precio_unitario} /></td>
                      <td className="num">{item.descuento > 0 ? <MoneyText value={item.descuento} /> : '—'}</td>
                      <td className="num"><MoneyText value={item.subtotal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="venta-detalle-totales">
                <div className="finance-row"><span>Subtotal</span><strong><MoneyText value={venta.subtotal} /></strong></div>
                {venta.descuento_total > 0 && (
                  <div className="finance-row"><span>Descuentos</span><strong>- <MoneyText value={venta.descuento_total} /></strong></div>
                )}
                <div className="finance-row is-total"><span>Total</span><strong><MoneyText value={venta.total} /></strong></div>
              </div>
            </>
          )}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cerrar</button>
          {venta && (
            <BotonRecibo
              className="admin-btn secondary"
              datos={desdeDetalleAdmin(venta as DetalleAdminRecibo, localDe(venta.sucursal_id))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

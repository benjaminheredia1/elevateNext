'use client';

import MoneyText from '@/components/ui/MoneyText';
import BotonRecibo from '@/components/ui/BotonRecibo';
import type { DatosRecibo } from '@/lib/recibo/tipos';

interface ReciboVentaModalProps {
  datos: DatosRecibo;
  /** Texto de la operación: "Venta registrada", "Fiado registrado"… */
  titulo: string;
  detalle?: string | null;
  onClose: () => void;
}

/**
 * Cierre de la venta en el POS: confirma que quedó registrada y le pregunta al
 * cajero si imprime el recibo.
 *
 * La impresión nunca es automática y no se recuerda la respuesta: la mayoría de
 * las ventas de mostrador no se llevan papel, y una impresora disparándose sola
 * en cada cobro gasta un rollo por día. El cajero decide venta por venta.
 */
export default function ReciboVentaModal({ datos, titulo, detalle, onClose }: ReciboVentaModalProps) {
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal compact" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2>{titulo}</h2>
            <p className="form-hint">Venta #{datos.numero} · <MoneyText value={datos.total} /></p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Cerrar">&times;</button>
        </div>

        <div className="admin-modal-body">
          {detalle && <p className="form-hint" style={{ marginTop: 0 }}>{detalle}</p>}
          <p className="form-hint">
            {/* El diálogo del navegador permite elegir "Guardar como PDF" como
                destino, así que el mismo botón sirve para imprimir y para
                guardar el comprobante. */}
            ¿Imprimir el recibo? El diálogo de impresión también permite guardarlo como PDF.
          </p>
        </div>

        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>
            No imprimir
          </button>
          <BotonRecibo datos={datos} className="admin-btn primary" />
        </div>
      </div>
    </div>
  );
}

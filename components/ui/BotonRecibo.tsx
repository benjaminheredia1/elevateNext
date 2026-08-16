'use client';

import { useState } from 'react';
import { construirReciboHtml } from '@/lib/recibo/recibo';
import { imprimirRecibo } from '@/lib/recibo/imprimir';
import type { DatosRecibo } from '@/lib/recibo/tipos';

interface BotonReciboProps {
  /** Null mientras no se conozcan los datos del local: el botón queda inhabilitado. */
  datos: DatosRecibo | null;
  etiqueta?: string;
  className?: string;
}

const IconoImpresora = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

/**
 * Imprime el recibo de una venta. Se usa en las tres pantallas desde las que se
 * reimprime: ventas del turno, historial de turnos y pedidos.
 *
 * Corta la propagación del clic porque en esas pantallas la fila entera es un
 * botón que despliega el detalle: sin esto, imprimir cerraría el detalle.
 */
export default function BotonRecibo({
  datos,
  etiqueta = 'Imprimir recibo',
  className = 'admin-btn secondary',
}: BotonReciboProps) {
  const [error, setError] = useState(false);

  const imprimir = (evento: React.MouseEvent) => {
    evento.stopPropagation();
    if (!datos) return;
    setError(!imprimirRecibo(construirReciboHtml(datos)));
  };

  return (
    <button
      type="button"
      className={className}
      onClick={imprimir}
      disabled={!datos}
      title={datos ? 'Imprimir el recibo de esta venta' : 'Cargando los datos del local…'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <IconoImpresora />
      {error ? 'No se pudo imprimir' : etiqueta}
    </button>
  );
}

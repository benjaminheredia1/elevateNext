'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSucursalTienda } from '@/hooks/sucursal-tienda';

const PinIcon = () => (
  <svg className="shop-sucursal-pin" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
    />
  </svg>
);

const ChevronIcon = ({ hacia }: { hacia: 'izq' | 'der' }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
    style={{ transform: hacia === 'izq' ? 'rotate(180deg)' : undefined }}>
    <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
  </svg>
);

/**
 * Selector de local en la tienda, en forma de pestañas: siempre a la vista, con
 * el local activo resaltado. El cliente tiene que saber en qué sucursal compra
 * aunque hoy haya una sola.
 *
 * - Un solo local: se agrega una pestaña apagada "Próximamente", que ocupa el
 *   lugar de la siguiente sucursal y anticipa la apertura sin prometer nombre.
 * - Muchos locales: la fila se desplaza y aparecen flechas para recorrerla
 *   hasta encontrar el indicado, en vez de apretujar las pestañas.
 */
export default function SucursalPicker({ compacto = false }: { compacto?: boolean }) {
  const { sucursales, sucursalId, elegir, cargando, debeElegir, sucursalActual } = useSucursalTienda();
  const filaRef = useRef<HTMLDivElement>(null);
  const [puedeIzq, setPuedeIzq] = useState(false);
  const [puedeDer, setPuedeDer] = useState(false);

  // Las flechas solo tienen sentido si la fila no entra entera en pantalla.
  const revisarDesborde = useCallback(() => {
    const fila = filaRef.current;
    if (!fila) return;
    const margen = 4; // tolerancia por redondeo de subpíxeles
    setPuedeIzq(fila.scrollLeft > margen);
    setPuedeDer(fila.scrollLeft + fila.clientWidth < fila.scrollWidth - margen);
  }, []);

  useEffect(() => {
    const fila = filaRef.current;
    if (!fila) return;
    revisarDesborde();
    // Al entrar, el local activo tiene que estar a la vista aunque esté al final.
    fila.querySelector('.is-activa')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    const observer = new ResizeObserver(revisarDesborde);
    observer.observe(fila);
    return () => observer.disconnect();
  }, [revisarDesborde, sucursales.length]);

  // Mientras carga no se muestra nada, para no parpadear con el local equivocado.
  if (cargando || sucursales.length === 0) return null;

  const cambiar = (id: number) => {
    if (id === sucursalId) return;
    elegir(id);
    // El menú, los precios y el carrito dependen del local: se recarga para no
    // dejar en pantalla productos de la sucursal anterior.
    window.location.reload();
  };

  const desplazar = (signo: 1 | -1) => {
    const fila = filaRef.current;
    if (!fila) return;
    fila.scrollBy({ left: signo * fila.clientWidth * 0.8, behavior: 'smooth' });
  };

  const conFlechas = puedeIzq || puedeDer;

  return (
    <div className={`shop-sucursal-block ${compacto ? 'is-compacto' : ''}`}>
      <div className={`shop-sucursal-row ${conFlechas ? 'con-flechas' : ''}`}>
        {conFlechas && (
          <button
            type="button"
            className="shop-sucursal-nav"
            onClick={() => desplazar(-1)}
            disabled={!puedeIzq}
            aria-label="Ver sucursales anteriores"
          >
            <ChevronIcon hacia="izq" />
          </button>
        )}

        <div
          className="shop-sucursal-tabs"
          role="group"
          aria-label="Sucursal"
          ref={filaRef}
          onScroll={revisarDesborde}
        >
          {sucursales.map(s => (
            <button
              key={s.id}
              type="button"
              className={`shop-sucursal-tab ${s.id === sucursalId ? 'is-activa' : ''}`}
              aria-pressed={s.id === sucursalId}
              onClick={() => cambiar(s.id)}
            >
              <PinIcon />
              {s.nombre}
            </button>
          ))}

          {!debeElegir && (
            <span className="shop-sucursal-tab is-proxima" aria-disabled="true">
              <PinIcon />
              Próximamente
            </span>
          )}
        </div>

        {conFlechas && (
          <button
            type="button"
            className="shop-sucursal-nav"
            onClick={() => desplazar(1)}
            disabled={!puedeDer}
            aria-label="Ver más sucursales"
          >
            <ChevronIcon hacia="der" />
          </button>
        )}
      </div>

      {!compacto && sucursalActual?.direccion && (
        <span className="shop-sucursal-dir">{sucursalActual.direccion}</span>
      )}
    </div>
  );
}

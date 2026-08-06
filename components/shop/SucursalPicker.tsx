'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSucursalTienda } from '@/hooks/sucursal-tienda';
import { linkWhatsApp } from '@/lib/pedido-whatsapp';
import { INSTAGRAM_URL } from '@/lib/redes';

const PinIcon = () => (
  <svg className="shop-sucursal-pin" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
    />
  </svg>
);

const WhatsappIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24Zm-2.6 3.9c-.15 0-.4.06-.6.29-.2.23-.79.77-.79 1.88s.81 2.18.92 2.33c.11.15 1.57 2.4 3.81 3.36.53.23.95.37 1.27.47.53.17 1.02.15 1.4.09.43-.06 1.32-.54 1.5-1.06.19-.52.19-.97.13-1.06-.05-.09-.2-.15-.42-.26-.23-.11-1.32-.65-1.53-.73-.2-.07-.35-.11-.5.12-.15.22-.57.72-.7.87-.13.15-.26.17-.48.06-.23-.12-.96-.36-1.83-1.13-.68-.6-1.13-1.35-1.27-1.57-.13-.23-.01-.35.1-.46.1-.1.23-.26.34-.4.11-.13.15-.23.22-.38.08-.15.04-.28-.02-.4-.06-.11-.5-1.21-.69-1.66-.18-.43-.36-.37-.5-.38h-.42Z"
    />
  </svg>
);

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
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
  const whatsapp = linkWhatsApp(sucursalActual?.telefono);

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

      {/* Contacto del local seleccionado: el WhatsApp y el mapa son de la
          sucursal, así que cambian al cambiar de pestaña. Instagram es de la
          marca y va siempre, al lado del WhatsApp: son los dos lugares por
          donde el cliente escribe o mira qué hay hoy. */}
      {!compacto && (
        <div className="shop-sucursal-contacto">
          {whatsapp && (
            <a className="shop-sucursal-accion" href={whatsapp} target="_blank" rel="noopener noreferrer">
              <WhatsappIcon />
              WhatsApp
            </a>
          )}
          <a className="shop-sucursal-accion" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
            <InstagramIcon />
            Instagram
          </a>
          {sucursalActual?.maps_url && (
            <a
              className="shop-sucursal-accion"
              href={sucursalActual.maps_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <PinIcon />
              Cómo llegar
            </a>
          )}
        </div>
      )}
    </div>
  );
}

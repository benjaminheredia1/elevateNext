'use client';

import { useCallback, useEffect, useState } from 'react';

export interface SucursalPublica {
  id: number;
  nombre: string;
  direccion: string | null;
  /** Contacto del local: cada sucursal tiene el suyo, no hay uno global. */
  telefono: string | null;
  maps_url: string | null;
  lat: number | null;
  lng: number | null;
  // Tarifa de delivery del local, para cotizar el envío en el checkout.
  envio_base: number;
  envio_km_incluidos: number;
  envio_por_km: number;
  envio_maximo: number | null;
  envio_radio_km: number | null;
}

const STORAGE_KEY = 'elevate:sucursal';

/** Sucursal guardada en el navegador, si sigue siendo válida. */
function leerGuardada(sucursales: SucursalPublica[]): number | null {
  if (typeof window === 'undefined') return null;
  const guardada = Number(window.localStorage.getItem(STORAGE_KEY));
  return sucursales.some(s => s.id === guardada) ? guardada : null;
}

/**
 * Local en el que compra el cliente. Define qué menú ve, a qué precio y a qué
 * sucursal se atribuye la venta. Se recuerda entre visitas; si la sucursal
 * guardada dejó de existir o se desactivó, se cae a la primera activa.
 */
export function useSucursalTienda() {
  const [sucursales, setSucursales] = useState<SucursalPublica[]>([]);
  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    fetch('/api/sucursales')
      .then(r => r.json())
      .then(res => {
        if (cancelado) return;
        const items: SucursalPublica[] = res.data ?? [];
        setSucursales(items);
        setSucursalId(leerGuardada(items) ?? items[0]?.id ?? null);
      })
      .catch(() => { if (!cancelado) setSucursales([]); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, []);

  const elegir = useCallback((id: number) => {
    setSucursalId(id);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  return {
    sucursales,
    sucursalId,
    elegir,
    cargando,
    // Con un solo local no tiene sentido preguntarle nada al cliente.
    debeElegir: sucursales.length > 1,
    sucursalActual: sucursales.find(s => s.id === sucursalId) ?? null,
  };
}

/** Sucursal elegida, leída directamente del navegador (fuera de React). */
export function sucursalElegidaId(): number | null {
  if (typeof window === 'undefined') return null;
  const guardada = Number(window.localStorage.getItem(STORAGE_KEY));
  return Number.isInteger(guardada) && guardada > 0 ? guardada : null;
}

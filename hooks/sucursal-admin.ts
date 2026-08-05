'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Sucursal en la que está trabajando el admin, compartida por todo el panel.
 *
 * Antes cada pantalla guardaba su propia selección en un `useState`, así que
 * cambiar de sucursal en Analítica no afectaba a Inventario y no había forma de
 * saber "dónde estoy parado". Este store la centraliza: la barra lateral la
 * muestra y la cambia, y cada pantalla la sigue.
 *
 * `undefined` = vista consolidada ("Todas").
 */
const STORAGE_KEY = 'elevate:admin:sucursal';

let valor: string | undefined;
let hidratado = false;
const suscriptores = new Set<() => void>();

function leerAlmacenado(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
}

function snapshot(): string | undefined {
  // La primera lectura en el cliente toma lo guardado; después manda la memoria.
  if (!hidratado && typeof window !== 'undefined') {
    valor = leerAlmacenado();
    hidratado = true;
  }
  return valor;
}

/** En el servidor no hay selección: evita desajustes de hidratación. */
function snapshotServidor(): string | undefined {
  return undefined;
}

function suscribir(alCambiar: () => void) {
  suscriptores.add(alCambiar);
  return () => { suscriptores.delete(alCambiar); };
}

export function setSucursalAdmin(nueva?: string) {
  if (nueva === snapshot()) return;
  valor = nueva;
  hidratado = true;
  if (typeof window !== 'undefined') {
    if (nueva) window.localStorage.setItem(STORAGE_KEY, nueva);
    else window.localStorage.removeItem(STORAGE_KEY);
  }
  suscriptores.forEach(fn => fn());
}

export function useSucursalAdmin() {
  const sucursal = useSyncExternalStore(suscribir, snapshot, snapshotServidor);
  const setSucursal = useCallback((nueva?: string) => setSucursalAdmin(nueva), []);

  /**
   * `false` en el primer render, `true` una vez montado en el cliente.
   *
   * En el render de hidratación React usa el snapshot del servidor, que no
   * puede leer localStorage, así que `sucursal` llega `undefined` aunque haya
   * una guardada. Las pantallas esperan a `listo` para pedir datos: sin eso
   * cada una disparaba una consulta sin sucursal —que devuelve el catálogo de
   * todo el negocio— y otra con la correcta apenas se resolvía.
   */
  const [listo, setListo] = useState(false);
  useEffect(() => { setListo(true); }, []);

  return { sucursal, setSucursal, listo };
}

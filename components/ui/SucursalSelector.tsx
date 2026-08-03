'use client';

import { useEffect } from 'react';
import { useSucursales } from '@/hooks/sucursales';
import { useSucursalAdmin } from '@/hooks/sucursal-admin';
import { useSesion } from '@/hooks/sesion';

/**
 * Selector de sucursal para los reportes del admin. "Todas" (valor vacío) deja
 * la vista consolidada. El backend igual encierra al cajero en su sucursal, así
 * que este control es informativo para roles sin alcance global.
 *
 * `permitirTodas={false}` para pantallas donde el consolidado no tiene sentido:
 * el rinde o el costo de receta de dos locales no se pueden sumar (si A arma 12
 * porciones y B arma 3, "15" no existe: nadie puede armarlas con un solo stock).
 * Ahí se obliga a elegir un local en vez de mostrar un número engañoso.
 */
export default function SucursalSelector({ value, onChange, permitirTodas = true }: {
  value?: string;
  onChange: (sucursal?: string) => void;
  permitirTodas?: boolean;
}) {
  const { data: sucursales = [] } = useSucursales();
  const { sucursal: sucursalPanel, setSucursal: setSucursalPanel } = useSucursalAdmin();
  const { esDueno } = useSesion();

  // La sucursal elegida en la barra lateral manda: la pantalla la adopta.
  //
  // Las dos reglas van en un solo efecto a propósito. Separadas, al montar la
  // pantalla ambas corrían con `value` todavía en undefined y la segunda pisaba
  // a la primera: elegías "Sucursal Sur" en la barra y Productos igual se abría
  // en la principal.
  useEffect(() => {
    if (sucursales.length === 0) return;

    // Pantallas sin consolidado (rinde, costo de receta): siempre un local
    // concreto. Se fija en el panel, no solo acá, para que la barra lateral no
    // diga "Todas" mientras la pantalla muestra los números de una sucursal.
    if (!permitirTodas && !sucursalPanel) {
      setSucursalPanel(String(sucursales[0].id));
      return;
    }

    if (sucursalPanel !== value) onChange(sucursalPanel);
    // `value` y `onChange` quedan fuera: el disparador es la sucursal del panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalPanel, permitirTodas, sucursales]);

  // Con una sola sucursal el selector no aporta nada y solo ocupa espacio.
  // Y quien no es dueño no elige: el servidor lo encierra en la suya, que la
  // barra lateral ya muestra.
  if (sucursales.length < 2 || !esDueno) return null;

  return (
    <label className="sucursal-selector">
      <span>Sucursal</span>
      <select
        value={value ?? ''}
        // Cambiar acá cambia la sucursal de todo el panel, no solo de esta pantalla.
        onChange={e => setSucursalPanel(e.target.value || undefined)}
      >
        {permitirTodas && <option value="">Todas</option>}
        {sucursales.map(s => (
          <option key={s.id} value={String(s.id)}>{s.nombre}</option>
        ))}
      </select>
    </label>
  );
}

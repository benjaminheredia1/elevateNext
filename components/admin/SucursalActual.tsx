'use client';

import { useSucursales } from '@/hooks/sucursales';
import { useSucursalAdmin } from '@/hooks/sucursal-admin';
import { useSesion } from '@/hooks/sesion';

const PinIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
    />
  </svg>
);

/**
 * Sucursal activa del panel, en la barra lateral bajo el logo.
 *
 * Siempre visible: saber en qué local estás parado condiciona la lectura de
 * cualquier número de la pantalla. Con varias sucursales es además el selector
 * que las cambia para todo el panel; con una sola se muestra el nombre, porque
 * no hay nada que elegir pero sí que informar.
 */
export default function SucursalActual() {
  const { data: sucursales = [], isLoading } = useSucursales();
  const { sucursal, setSucursal } = useSucursalAdmin();
  const { sesion, esDueno } = useSesion();

  if (isLoading || sucursales.length === 0) return null;

  // Quien no es dueño trabaja encerrado en su sucursal: se muestra cuál es, sin
  // desplegable. El servidor lo impone igual; acá solo se evita ofrecer un
  // control que no haría nada.
  const propia = sucursales.find(s => s.id === sesion?.sucursal_id);
  if (!esDueno) {
    return (
      <div className="admin-sucursal-actual">
        <span className="admin-sucursal-label"><PinIcon /> Sucursal</span>
        <span className="admin-sucursal-unica">{propia?.nombre ?? 'Sin asignar'}</span>
        {propia?.direccion && <span className="admin-sucursal-dir">{propia.direccion}</span>}
        {!propia && (
          <span className="admin-sucursal-dir">
            Pedile al dueño que te asigne una sucursal para ver los datos.
          </span>
        )}
      </div>
    );
  }

  // Con un solo local, ese local es siempre el activo aunque no haya selección.
  const activa = sucursales.length === 1
    ? sucursales[0]
    : sucursales.find(s => String(s.id) === sucursal);

  return (
    <div className="admin-sucursal-actual">
      <span className="admin-sucursal-label"><PinIcon /> Sucursal</span>

      {sucursales.length > 1 ? (
        <select
          value={sucursal ?? ''}
          onChange={e => setSucursal(e.target.value || undefined)}
          aria-label="Cambiar de sucursal"
        >
          <option value="">Todas (consolidado)</option>
          {sucursales.map(s => (
            <option key={s.id} value={String(s.id)}>{s.nombre}</option>
          ))}
        </select>
      ) : (
        <span className="admin-sucursal-unica">{sucursales[0].nombre}</span>
      )}

      {activa?.direccion && <span className="admin-sucursal-dir">{activa.direccion}</span>}
    </div>
  );
}

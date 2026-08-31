'use client';

import AdminInsumos from '@/components/admin/AdminInsumos';

/**
 * Inventario para el cajero: la misma vista de admin, de solo lectura salvo por
 * la merma y el conteo físico de su propio local.
 *
 * Esas dos son suyas porque es quien está ahí: ve caerse el brownie y cuenta la
 * vitrina al cerrar turno. El servidor lo exige igual —los handlers verifican
 * que la sucursal sea la del cajero—; esto es solo para que tenga el botón.
 */
export default function InsumosCajaPage() {
  return <AdminInsumos readOnly soloAjustes />;
}

'use client';

import AdminInsumos from '@/components/admin/AdminInsumos';

/** Inventario para el cajero: la misma vista de admin pero solo lectura. */
export default function InsumosCajaPage() {
  return <AdminInsumos readOnly />;
}

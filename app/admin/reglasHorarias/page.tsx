import { redirect } from 'next/navigation';

/**
 * La pantalla de reglas horarias se unificó en "Combos y promos", que hace lo
 * mismo y además maneja la franja horaria, los días y la sucursal, y deja
 * elegir a qué productos aplica. Se conserva la ruta redirigiendo para no
 * romper enlaces guardados ni accesos directos del navegador.
 */
export default function AdminReglasPage() {
  redirect('/admin/combos');
}

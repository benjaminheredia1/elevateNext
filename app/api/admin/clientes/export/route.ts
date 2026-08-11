import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/server/errors';
import { GET as listarClientes } from '../route';
import { excelResponse, fechaExcel, montoExcel } from '@/lib/server/export/excel';

interface ClienteExport {
  nombre: string;
  telefono: string | null;
  pedidos: number;
  total_gastado: number;
  gasto_promedio: number;
  ultima_compra: string | null;
  created_at: string;
  /** Compras dentro del periodo del filtro: define si la fila se muestra. */
  pedidos_periodo?: number;
}

/**
 * Clientes en Excel.
 *
 * Se apoya en el endpoint del listado en vez de repetir su consulta: así el
 * archivo muestra exactamente los mismos números que la pantalla —incluidos el
 * filtro por sucursal y el rango de fechas— y no hay dos formas de calcular
 * cuánto gastó un cliente que se puedan ir separando con el tiempo.
 * La autorización y el alcance también son los de ese endpoint.
 */
export async function GET(req: NextRequest) {
  try {
    const respuesta = await listarClientes(req);
    if (!respuesta.ok) return respuesta;
    const { items } = (await respuesta.json()) as { items: ClienteExport[] };

    // La pantalla descarta a quien no compro en el periodo elegido, y lo hace en
    // el navegador: el endpoint devuelve a todos con sus metricas del periodo en
    // cero. Sin repetir esa regla aca, elegir "Hoy" bajaba igual la base entera.
    const rango = new URL(req.url).searchParams.get('rango') ?? 'mes';
    const filas = rango === 'todo' ? items : items.filter(c => (c.pedidos_periodo ?? 0) > 0);

    return await excelResponse('clientes', 'Clientes', [
      { header: 'Cliente', ancho: 26, valor: c => c.nombre },
      { header: 'Teléfono', ancho: 14, valor: c => c.telefono ?? '' },
      { header: 'Desde', ancho: 12, valor: c => fechaExcel(c.created_at) },
      { header: 'N° Pedidos', ancho: 12, tipo: 'numero', valor: c => c.pedidos },
      { header: 'Total gastado Bs', ancho: 18, tipo: 'numero', valor: c => montoExcel(c.total_gastado) },
      { header: 'Promedio Bs', ancho: 14, tipo: 'numero', valor: c => montoExcel(c.gasto_promedio) },
      { header: 'Último pedido', ancho: 14, valor: c => fechaExcel(c.ultima_compra) },
    ], filas);
  } catch (e) { return handleApiError(e); }
}

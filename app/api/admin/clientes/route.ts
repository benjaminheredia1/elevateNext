import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import prisma from '@/lib/prisma';

const nuevoClienteSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  telefono: z.string().trim().max(30).optional(),
  nit: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  direccion: z.string().trim().max(200).optional(),
});

type ProductStat = {
  producto_id: number;
  nombre: string;
  cantidad: number;
  total: number;
};

function monthRange(value: string | null) {
  const now = new Date();
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) - 1 : now.getMonth();
  const desde = new Date(year, month, 1);
  const hasta = new Date(year, month + 1, 1);
  return {
    desde,
    hasta,
    mes: `${year}-${String(month + 1).padStart(2, '0')}`,
  };
}

function topProductFromTransactions(transacciones: any[]): ProductStat | null {
  const products = new Map<number, ProductStat>();

  for (const tx of transacciones) {
    for (const detalle of tx.transaccionesDetalles_id ?? []) {
      const current = products.get(detalle.producto_id) ?? {
        producto_id: detalle.producto_id,
        nombre: detalle.producto?.nombre ?? 'Producto',
        cantidad: 0,
        total: 0,
      };
      current.cantidad += Number(detalle.cantidad ?? 0);
      current.total += Number(detalle.precio_unitario ?? 0) * Number(detalle.cantidad ?? 0);
      products.set(detalle.producto_id, current);
    }
  }

  return Array.from(products.values())
    .sort((a, b) => b.cantidad - a.cantidad || b.total - a.total)[0] ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.toLowerCase() ?? '';
    const range = monthRange(searchParams.get('mes'));

    const clientes = await prisma.cliente.findMany({
      where: { es_anonimo: false },
      include: {
        transacciones: {
          include: {
            transaccionesDetalles_id: {
              include: { producto: { select: { nombre: true } } },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const globalMonthTxs: any[] = [];

    const items = clientes
      .map(c => {
        const txs = c.transacciones;
        const validMonthTxs = txs.filter(t =>
          t.estado !== 'CANCELADO' &&
          t.created_at >= range.desde &&
          t.created_at < range.hasta,
        );
        globalMonthTxs.push(...validMonthTxs);

        const total_gastado = txs.reduce((s, t) => s + t.total, 0);
        const gastado_mes = validMonthTxs.reduce((s, t) => s + t.total, 0);
        const ultima_compra = txs.length > 0
          ? txs.reduce((max, t) => t.created_at > max ? t.created_at : max, txs[0].created_at)
          : null;
        const primer_pedido = txs.length > 0
          ? txs.reduce((min, t) => t.created_at < min ? t.created_at : min, txs[0].created_at)
          : null;
        const productoFavoritoMes = topProductFromTransactions(validMonthTxs);

        return {
          id: c.id,
          nombre: c.nombre,
          telefono: c.telefono,
          direccion: c.direccion,
          pedidos: txs.length,
          total_gastado: Number(total_gastado.toFixed(2)),
          gasto_promedio: txs.length > 0 ? Number((total_gastado / txs.length).toFixed(2)) : 0,
          pedidos_mes: validMonthTxs.length,
          gastado_mes: Number(gastado_mes.toFixed(2)),
          ticket_promedio_mes: validMonthTxs.length > 0 ? Number((gastado_mes / validMonthTxs.length).toFixed(2)) : 0,
          producto_favorito_mes: productoFavoritoMes,
          primer_pedido,
          ultima_compra,
          created_at: c.created_at,
        };
      })
      .filter(c => !q || c.nombre.toLowerCase().includes(q) || (c.telefono ?? '').includes(q));

    const totalClientes = items.length;
    const totalIngresos = Number(items.reduce((s, c) => s + c.total_gastado, 0).toFixed(2));
    const gastoPromedio = totalClientes > 0 ? Number((totalIngresos / totalClientes).toFixed(2)) : 0;
    const clientesActivosMes = items.filter(c => c.pedidos_mes > 0);
    const ingresosMes = Number(clientesActivosMes.reduce((s, c) => s + c.gastado_mes, 0).toFixed(2));
    const pedidosMes = clientesActivosMes.reduce((s, c) => s + c.pedidos_mes, 0);
    const clienteMasComprador = clientesActivosMes
      .slice()
      .sort((a, b) => b.gastado_mes - a.gastado_mes || b.pedidos_mes - a.pedidos_mes)[0] ?? null;
    const clienteMasFrecuente = clientesActivosMes
      .slice()
      .sort((a, b) => b.pedidos_mes - a.pedidos_mes || b.gastado_mes - a.gastado_mes)[0] ?? null;
    const productoMasComprado = topProductFromTransactions(globalMonthTxs);

    return NextResponse.json({
      items,
      resumen: {
        total_clientes: totalClientes,
        ingresos_totales: totalIngresos,
        gasto_promedio: gastoPromedio,
        mes: range.mes,
        clientes_activos_mes: clientesActivosMes.length,
        ingresos_mes: ingresosMes,
        pedidos_mes: pedidosMes,
        ticket_promedio_mes: pedidosMes > 0 ? Number((ingresosMes / pedidosMes).toFixed(2)) : 0,
        cliente_mas_comprador: clienteMasComprador,
        cliente_mas_frecuente: clienteMasFrecuente,
        producto_mas_comprado: productoMasComprado,
        top_clientes_mes: clientesActivosMes
          .slice()
          .sort((a, b) => b.gastado_mes - a.gastado_mes || b.pedidos_mes - a.pedidos_mes)
          .slice(0, 5),
      },
    });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = nuevoClienteSchema.parse(await req.json());
    const tel = input.telefono ? input.telefono.replace(/\D/g, '') || null : null;

    if (tel) {
      const existe = await prisma.cliente.findFirst({ where: { telefono: tel }, select: { id: true, nombre: true } });
      if (existe) throw new ValidationError(`Ya existe un cliente con ese teléfono: ${existe.nombre}`);
    }

    const cliente = await prisma.cliente.create({
      data: {
        nombre: input.nombre,
        telefono: tel,
        nit: input.nit?.replace(/\D/g, '') || null,
        email: input.email?.trim().toLowerCase() || null,
        direccion: input.direccion?.trim() || null,
      },
    });
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CREO',
      entidad: 'Cliente', entidadId: cliente.id,
      detalle: `Registró cliente ${cliente.nombre}`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(cliente, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import prisma from '@/lib/prisma';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal, parseRango } from '@/lib/server/finanzas/rango';

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
    /**
     * Único período de la pantalla: hoy, la semana, el mes, todo o un rango a
     * medida. Manda sobre la lista Y sobre las tarjetas de fidelización.
     *
     * Antes las tarjetas usaban un "mes de fidelización" elegido aparte, así que
     * se podía estar viendo la lista de esta semana con el mejor cliente de otro
     * mes, y nada en la pantalla avisaba de la mezcla.
     */
    const periodo = await parseRango(searchParams);
    // El cliente es del negocio, no de un local: no se le pone sucursal. Lo que
    // se filtra son sus compras, y "clientes de la sucursal" pasa a significar
    // los que compraron ahí — que es la pregunta que de verdad se hace el local.
    const sucursalId = alcanceSucursal(session, parseSucursal(searchParams));

    const clientes = await prisma.cliente.findMany({
      where: { es_anonimo: false },
      include: {
        transacciones: {
          ...(sucursalId ? { where: { sucursal_id: sucursalId } } : {}),
          include: {
            transaccionesDetalles_id: {
              include: { producto: { select: { nombre: true } } },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    /** Todas las compras del período, de todos los clientes: alimenta los rankings. */
    const txsGlobalesPeriodo: any[] = [];

    const items = clientes
      .map(c => {
        const txs = c.transacciones;
        const txsPeriodo = txs.filter(t =>
          t.estado !== 'CANCELADO' &&
          t.created_at >= periodo.desde &&
          t.created_at <= periodo.hasta,
        );
        txsGlobalesPeriodo.push(...txsPeriodo);

        // Histórico completo: no depende del filtro, es la ficha del cliente.
        const total_gastado = txs.reduce((s, t) => s + Number(t.total), 0);
        const ultima_compra = txs.length > 0
          ? txs.reduce((max, t) => t.created_at > max ? t.created_at : max, txs[0].created_at)
          : null;
        const primer_pedido = txs.length > 0
          ? txs.reduce((min, t) => t.created_at < min ? t.created_at : min, txs[0].created_at)
          : null;

        const gastadoPeriodo = txsPeriodo.reduce((s, t) => s + Number(t.total), 0);

        return {
          id: c.id,
          nombre: c.nombre,
          telefono: c.telefono,
          direccion: c.direccion,
          pedidos: txs.length,
          total_gastado: Number(total_gastado.toFixed(2)),
          gasto_promedio: txs.length > 0 ? Number((total_gastado / txs.length).toFixed(2)) : 0,
          // Del período del filtro, que es lo que se lista, ordena y resume.
          pedidos_periodo: txsPeriodo.length,
          gastado_periodo: Number(gastadoPeriodo.toFixed(2)),
          ticket_promedio_periodo: txsPeriodo.length > 0
            ? Number((gastadoPeriodo / txsPeriodo.length).toFixed(2))
            : 0,
          producto_favorito_periodo: topProductFromTransactions(txsPeriodo),
          primer_pedido,
          ultima_compra,
          created_at: c.created_at,
        };
      })
      .filter(c => !q || c.nombre.toLowerCase().includes(q) || (c.telefono ?? '').includes(q))
      // Con una sucursal elegida, quien nunca compró ahí no es cliente de ese
      // local: mostrarlo con todo en cero solo ensucia la lista.
      .filter(c => !sucursalId || c.pedidos > 0);

    const totalClientes = items.length;
    const totalIngresos = Number(items.reduce((s, c) => s + c.total_gastado, 0).toFixed(2));
    const gastoPromedio = totalClientes > 0 ? Number((totalIngresos / totalClientes).toFixed(2)) : 0;
    const clientesActivos = items.filter(c => c.pedidos_periodo > 0);
    const ingresosPeriodo = Number(clientesActivos.reduce((s, c) => s + c.gastado_periodo, 0).toFixed(2));
    const pedidosPeriodo = clientesActivos.reduce((s, c) => s + c.pedidos_periodo, 0);
    const clienteMasComprador = clientesActivos
      .slice()
      .sort((a, b) => b.gastado_periodo - a.gastado_periodo || b.pedidos_periodo - a.pedidos_periodo)[0] ?? null;
    const clienteMasFrecuente = clientesActivos
      .slice()
      .sort((a, b) => b.pedidos_periodo - a.pedidos_periodo || b.gastado_periodo - a.gastado_periodo)[0] ?? null;
    const productoMasComprado = topProductFromTransactions(txsGlobalesPeriodo);

    // Mejor cliente del negocio entero, sin importar la sucursal que se esté
    // viendo: permite reconocer al que más compra aunque reparta sus compras
    // entre locales. Solo el dueño ve un dato que cruza sucursales.
    const clienteTopNegocio = await (async () => {
      const [top] = await prisma.transaccion.groupBy({
        by: ['cliente_id'],
        where: {
          estado: { not: 'CANCELADO' },
          created_at: { gte: periodo.desde, lte: periodo.hasta },
          cliente: { es_anonimo: false },
        },
        _sum: { total: true },
        _count: { _all: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 1,
      });
      if (!top?.cliente_id) return null;
      const cliente = await prisma.cliente.findUnique({
        where: { id: top.cliente_id },
        select: { id: true, nombre: true },
      });
      if (!cliente) return null;
      // En cuántos locales compró: distingue al fiel de uno del que rota.
      const locales = await prisma.transaccion.groupBy({
        by: ['sucursal_id'],
        where: {
          cliente_id: top.cliente_id,
          estado: { not: 'CANCELADO' },
          created_at: { gte: periodo.desde, lte: periodo.hasta },
        },
      });
      return {
        id: cliente.id,
        nombre: cliente.nombre,
        gastado_periodo: Number(Number(top._sum.total ?? 0).toFixed(2)),
        pedidos_periodo: top._count._all,
        sucursales: locales.length,
      };
    })();

    // Productos favoritos: cuántos clientes tienen cada producto como su
    // favorito dentro del período.
    const favoritosMap = new Map<number, { producto_id: number; nombre: string; clientes: number; unidades: number }>();
    for (const c of items) {
      const fav = c.producto_favorito_periodo;
      if (!fav) continue;
      const prev = favoritosMap.get(fav.producto_id) ?? { producto_id: fav.producto_id, nombre: fav.nombre, clientes: 0, unidades: 0 };
      prev.clientes += 1;
      prev.unidades += Number(fav.cantidad ?? 0);
      favoritosMap.set(fav.producto_id, prev);
    }
    const topFavoritos = Array.from(favoritosMap.values())
      .sort((a, b) => b.clientes - a.clientes || b.unidades - a.unidades)
      .slice(0, 5);

    return NextResponse.json({
      items,
      resumen: {
        // Base registrada e histórico: no dependen del período.
        total_clientes: totalClientes,
        ingresos_totales: totalIngresos,
        gasto_promedio: gastoPromedio,
        // Todo lo de abajo es del período elegido en el filtro.
        clientes_activos_periodo: clientesActivos.length,
        ingresos_periodo: ingresosPeriodo,
        pedidos_periodo: pedidosPeriodo,
        ticket_promedio_periodo: pedidosPeriodo > 0
          ? Number((ingresosPeriodo / pedidosPeriodo).toFixed(2))
          : 0,
        // Los dos de abajo son del alcance visible (una sucursal, o todas para
        // el dueño); `cliente_top_negocio` siempre cruza todos los locales.
        cliente_mas_comprador: clienteMasComprador,
        cliente_mas_frecuente: clienteMasFrecuente,
        cliente_top_negocio: clienteTopNegocio,
        producto_mas_comprado: productoMasComprado,
        top_favoritos_periodo: topFavoritos,
        // Clientes con compras en el período, de mayor a menor gasto (desempate por pedidos).
        top_clientes_periodo: clientesActivos
          .slice()
          .sort((a, b) => b.gastado_periodo - a.gastado_periodo || b.pedidos_periodo - a.pedidos_periodo),
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

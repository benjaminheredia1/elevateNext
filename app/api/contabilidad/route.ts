import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';
import { rangoDiaNegocio, inicioMesNegocio } from '@/lib/server/fechas';

export async function GET(req: NextRequest) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const rango = searchParams.get('rango') || 'mes'; // hoy | semana | mes | rango
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');

    const now = new Date();
    let fechaInicio: Date;
    let fechaFin: Date = new Date();

    if (rango === 'hoy') {
      fechaInicio = rangoDiaNegocio().desde;
    } else if (rango === '7dias') {
      fechaInicio = new Date(); fechaInicio.setDate(now.getDate() - 7);
    } else if (rango === 'mes') {
      fechaInicio = inicioMesNegocio();
    } else if (rango === 'rango' && desde && hasta) {
      fechaInicio = rangoDiaNegocio(desde).desde;
      fechaFin = rangoDiaNegocio(hasta).hasta;
    } else {
      fechaInicio = inicioMesNegocio();
    }

    // Ventas del período
    const transacciones = await prisma.transaccion.findMany({
      where: {
        created_at: { gte: fechaInicio, lte: fechaFin },
        estado: { in: ['PAGADO', 'ENTREGADO'] },
      },
      include: {
        transaccionesDetalles_id: {
          include: {
            producto: {
              include: {
                recetaProducto_id: {
                  include: { insumo: { select: { costo_promedio: true } } }
                }
              }
            }
          }
        }
      }
    });

    const totalVentas = transacciones.reduce((a, t) => a + Number(t.total), 0);
    const totalPedidos = transacciones.length;
    const ticketPromedio = totalPedidos > 0 ? totalVentas / totalPedidos : 0;

    // Calcular CMV
    let cmv = 0;
    for (const t of transacciones) {
      for (const d of t.transaccionesDetalles_id) {
        for (const r of d.producto.recetaProducto_id) {
          cmv += r.cantidad_utilizada * r.insumo.costo_promedio * d.cantidad;
        }
      }
    }

    // Compras/gastos del período (movimientos INGRESO en insumos)
    const compras = await prisma.movimientoInterno.findMany({
      where: {
        tipo_movimiento: 'INGRESO',
        created_at: { gte: fechaInicio, lte: fechaFin },
      },
      include: { insumo: { select: { nombre: true, costo_promedio: true, unidad_medida: true } } },
    });

    const gastos = await prisma.gasto.findMany({
      where: { created_at: { gte: fechaInicio, lte: fechaFin } },
    });
    const totalGastos = gastos.reduce((a, g) => a + Number(g.monto), 0);

    // Ventas por método de pago
    const ventasEfectivo = transacciones.filter(t => t.metodo_pago === 'EFECTIVO').reduce((a, t) => a + Number(t.total), 0);
    const ventasQR = transacciones.filter(t => t.metodo_pago === 'QR').reduce((a, t) => a + Number(t.total), 0);

    // Más vendidos
    const productoMap: Record<number, { nombre: string; cantidad: number; ingresos: number }> = {};
    for (const t of transacciones) {
      for (const d of t.transaccionesDetalles_id) {
        if (!productoMap[d.producto_id]) {
          productoMap[d.producto_id] = { nombre: d.producto.nombre, cantidad: 0, ingresos: 0 };
        }
        productoMap[d.producto_id].cantidad += d.cantidad;
        productoMap[d.producto_id].ingresos += Number(d.precio_unitario) * d.cantidad;
      }
    }
    const masVendidos = Object.values(productoMap).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);

    const utilidadBruta = totalVentas - cmv;
    const utilidadNeta = utilidadBruta - totalGastos;

    return NextResponse.json({
      data: {
        total_ventas: totalVentas,
        total_pedidos: totalPedidos,
        ticket_promedio: ticketPromedio,
        cmv,
        total_gastos: totalGastos,
        utilidad_bruta: utilidadBruta,
        utilidad_neta: utilidadNeta,
        margen_bruto: totalVentas > 0 ? (utilidadBruta / totalVentas) * 100 : 0,
        margen_neto: totalVentas > 0 ? (utilidadNeta / totalVentas) * 100 : 0,
        ventas_efectivo: ventasEfectivo,
        ventas_qr: ventasQR,
        mas_vendidos: masVendidos,
        compras: compras.map(c => ({
          id: c.id,
          descripcion: `Compra · ${c.insumo.nombre}`,
          monto: c.cantidad * c.insumo.costo_promedio,
          categoria: 'Insumos',
          fecha: c.created_at,
          tipo: 'egreso',
        })),
        gastos: gastos.map(g => ({
          id: g.id,
          descripcion: g.descripcion,
          monto: g.monto,
          categoria: 'Gasto Operativo',
          fecha: g.created_at,
          tipo: 'egreso',
        })),
        ventas_lista: transacciones.map(t => ({
          id: t.id,
          descripcion: `Venta #${t.id}`,
          monto: t.total,
          metodo_pago: t.metodo_pago,
          fecha: t.created_at,
          tipo: 'ingreso',
        })),
      }
    });
  } catch (error) {
    console.error('GET /api/contabilidad error:', error);
    return NextResponse.json({ error: 'Error al obtener contabilidad' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

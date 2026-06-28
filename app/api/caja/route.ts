import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/caja - obtener caja activa o historial
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const historial = searchParams.get('historial') === 'true';

    if (historial) {
      const cajas = await prisma.caja.findMany({
        orderBy: { fecha_apertura: 'desc' },
        take: 30,
        include: { gastos: true, usuario: { select: { nombre: true } } },
      });
      return NextResponse.json({ data: cajas });
    }

    const cajaActiva = await prisma.caja.findFirst({
      where: { estado: 'ABIERTA' },
      include: {
        gastos: true,
        usuario: { select: { nombre: true } },
      },
    });

    // Calcular ingresos desde ventas PAGADO/ENTREGADO de hoy
    if (cajaActiva) {
      const ventas = await prisma.transaccion.findMany({
        where: {
          created_at: { gte: cajaActiva.fecha_apertura },
          estado: { in: ['PAGADO', 'ENTREGADO'] },
        },
        select: { total: true, metodo_pago: true },
      });

      const ingresosEfectivo = ventas.filter(v => v.metodo_pago === 'EFECTIVO').reduce((a, v) => a + v.total, 0);
      const ingresosQR = ventas.filter(v => v.metodo_pago === 'QR').reduce((a, v) => a + v.total, 0);
      const totalIngresos = ventas.reduce((a, v) => a + v.total, 0);
      const totalEgresos = cajaActiva.gastos.reduce((a, g) => a + g.monto, 0);

      return NextResponse.json({
        data: cajaActiva,
        stats: {
          ingresos_efectivo: ingresosEfectivo,
          ingresos_qr: ingresosQR,
          total_ingresos: totalIngresos,
          total_egresos: totalEgresos,
          flujo_neto: totalIngresos - totalEgresos,
          total_en_caja_efectivo: cajaActiva.monto_inicial + ingresosEfectivo - totalEgresos,
          total_en_caja_qr: ingresosQR,
          movimientos: ventas,
        }
      });
    }

    return NextResponse.json({ data: null, stats: null });
  } catch (error) {
    console.error('GET /api/caja error:', error);
    return NextResponse.json({ error: 'Error al obtener caja' }, { status: 500 });
  }
}

// POST /api/caja - abrir o cerrar caja
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accion, monto_inicial, usuario_id } = body;

    if (accion === 'abrir') {
      // Verificar que no haya caja abierta
      const cajaActiva = await prisma.caja.findFirst({ where: { estado: 'ABIERTA' } });
      if (cajaActiva) {
        return NextResponse.json({ error: 'Ya hay una caja abierta' }, { status: 400 });
      }
      const caja = await prisma.caja.create({
        data: {
          monto_inicial: monto_inicial ?? 0,
          usuario_id: usuario_id ?? 1,
          estado: 'ABIERTA',
        }
      });
      return NextResponse.json({ data: caja }, { status: 201 });
    }

    if (accion === 'cerrar') {
      const cajaActiva = await prisma.caja.findFirst({ where: { estado: 'ABIERTA' } });
      if (!cajaActiva) {
        return NextResponse.json({ error: 'No hay caja abierta' }, { status: 400 });
      }
      const caja = await prisma.caja.update({
        where: { id: cajaActiva.id },
        data: { estado: 'CERRADA', fecha_cierre: new Date() },
      });
      return NextResponse.json({ data: caja });
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/caja error:', error);
    return NextResponse.json({ error: 'Error en caja' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError, ConflictError, NotFoundError } from '@/lib/server/errors';
import { logAudit } from '@/lib/server/audit/audit.service';
import { guard, ADMIN } from '@/lib/server/auth/guard';
import { resolverSucursal } from '@/lib/server/sucursales/sucursal.service';
import { obtenerOCrearStock } from '@/lib/server/inventario/stock-sucursal.service';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(_, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const insumo = await prisma.insumo.findFirst({ where: { id: Number(id) } });
    if (!insumo) return NextResponse.json({ message: 'No encontrado' }, { status: 404 });
    return NextResponse.json(insumo);
  } catch {
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const session = await requireAuth(request);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const insumoId = Number(id);
    const anterior = await prisma.insumo.findUnique({ where: { id: insumoId } });
    if (!anterior) throw new NotFoundError('Insumo no encontrado');

    // `stock_actual` se ignora a propósito aunque venga en el body: el stock es
    // consecuencia de movimientos (compra, merma, conteo, venta), nunca de una
    // edición. Escribirlo acá pisaba las ventas descontadas mientras el formulario
    // estaba abierto, sin dejar rastro, y con multi-sucursal desincronizaba
    // `Insumo` (agregado) de `StockSucursal` (por local).
    const {
      categoria_insumo, costo_promedio, equivalencia_cantidad, equivalencia_unidad, nombre, proveedor,
      punto_critico, stock_minimo, unidad_medida, sucursal_id,
    } = await request.json();
    const tieneEquivalencia = equivalencia_unidad && equivalencia_cantidad;
    const costoNum = Number(costo_promedio || 0);
    const minimoNum = Number(stock_minimo || 0);
    const criticoNum = Number(punto_critico || 0);

    // El costo y los umbrales de alerta que de verdad se usan (food cost,
    // rinde, alertas) son los de StockSucursal desde multi-sucursal; el
    // Insumo de acá abajo queda como catálogo/fallback para un local que
    // todavía no maneja este insumo. Sin escribir también en StockSucursal,
    // editar el costo acá no movía nada de lo que se calcula con él.
    const sucursalId = await resolverSucursal(sucursal_id);

    const insumo = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.insumo.update({
        where: { id: insumoId },
        data: {
          categoria_insumo: categoria_insumo || null,
          costo_promedio: costoNum,
          equivalencia_cantidad: tieneEquivalencia ? Number(equivalencia_cantidad) : null,
          equivalencia_unidad: tieneEquivalencia ? equivalencia_unidad : null,
          nombre,
          proveedor: proveedor || null,
          punto_critico: criticoNum,
          stock_minimo: minimoNum,
          unidad_medida,
        },
      });

      await obtenerOCrearStock(insumoId, sucursalId, tx);
      await tx.stockSucursal.update({
        where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
        data: { costo_promedio: costoNum, stock_minimo: minimoNum, punto_critico: criticoNum },
      });

      return actualizado;
    });

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Insumo', entidadId: insumoId,
      detalle: `Editó insumo "${insumo.nombre}" (costo en sucursal #${sucursalId}: ${costoNum})`,
      ip: getClientIp(request), userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(insumo);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const insumoId = Number(id);

    const insumo = await prisma.insumo.findUnique({ where: { id: insumoId } });
    if (!insumo) throw new NotFoundError('Insumo no encontrado');

    // Verificar si está en uso en recetas (ELABORADOS)
    const enRecetas = await prisma.recetasProducto.count({
      where: { insumo_id: insumoId },
    });

    // Verificar si es producto de reventa (con compras)
    const enReventa = await prisma.producto.count({
      where: { insumo_reventa_id: insumoId },
    });

    // Verificar insumos mixtos
    const [comoHijo, comoPadre] = await Promise.all([
      prisma.insumoMixtoDetalle.count({ where: { insumo_hijo_id: insumoId } }),
      prisma.insumoMixtoDetalle.count({ where: { insumo_padre_id: insumoId } }),
    ]);

    // Mostrar errores indicando qué opción usar
    const usos: string[] = [];
    if (enRecetas) {
      usos.push(
        `${enRecetas} receta(s) de ELABORADOS — usa "Dar de baja" en su lugar`
      );
    }
    if (enReventa) {
      usos.push(`${enReventa} producto(s) de REVENTA — usa "Dar de baja" o edita el producto`);
    }
    if (comoHijo || comoPadre) {
      usos.push('insumos mixtos — quita esas referencias primero');
    }

    if (usos.length > 0) {
      throw new ConflictError(
        `No se puede eliminar: ${usos.join('; ')}. Usa "Dar de baja" (PATCH) si quieres desactivarlo con cascada.`
      );
    }

    // Solo eliminar si no tiene ninguna referencia
    await prisma.$transaction([
      prisma.movimientoInterno.deleteMany({ where: { insumo_id: insumoId } }),
      prisma.insumo.delete({ where: { id: insumoId } }),
    ]);

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'ELIMINO',
      entidad: 'Insumo', entidadId: insumoId,
      detalle: `Eliminó insumo "${insumo.nombre}"`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

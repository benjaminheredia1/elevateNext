import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError, ConflictError, NotFoundError } from '@/lib/server/errors';
import { logAudit } from '@/lib/server/audit/audit.service';
import { guard, ADMIN } from '@/lib/server/auth/guard';

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

    const {
      categoria_insumo, costo_promedio, equivalencia_cantidad, equivalencia_unidad, nombre, proveedor,
      punto_critico, stock_actual, stock_minimo, unidad_medida,
    } = await request.json();
    const tieneEquivalencia = equivalencia_unidad && equivalencia_cantidad;
    const insumo = await prisma.insumo.update({
      where: { id: insumoId },
      data: {
        categoria_insumo: categoria_insumo || null,
        costo_promedio: Number(costo_promedio || 0),
        equivalencia_cantidad: tieneEquivalencia ? Number(equivalencia_cantidad) : null,
        equivalencia_unidad: tieneEquivalencia ? equivalencia_unidad : null,
        nombre,
        proveedor: proveedor || null,
        punto_critico: Number(punto_critico || 0),
        stock_actual: Number(stock_actual ?? anterior.stock_actual),
        stock_minimo: Number(stock_minimo || 0),
        unidad_medida,
      },
    });

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Insumo', entidadId: insumoId,
      detalle: `Editó insumo "${insumo.nombre}"`,
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

    // No permitir eliminar si está en uso (recetas, productos de reventa o insumos mixtos)
    const [enRecetas, enReventa, comoHijo, comoPadre] = await Promise.all([
      prisma.recetasProducto.count({ where: { insumo_id: insumoId } }),
      prisma.producto.count({ where: { insumo_reventa_id: insumoId } }),
      prisma.insumoMixtoDetalle.count({ where: { insumo_hijo_id: insumoId } }),
      prisma.insumoMixtoDetalle.count({ where: { insumo_padre_id: insumoId } }),
    ]);
    const usos: string[] = [];
    if (enRecetas) usos.push(`${enRecetas} receta(s)`);
    if (enReventa) usos.push(`${enReventa} producto(s) de reventa`);
    if (comoHijo || comoPadre) usos.push('insumos mixtos');
    if (usos.length > 0) {
      throw new ConflictError(`No se puede eliminar: está en uso por ${usos.join(', ')}. Quita esas referencias primero.`);
    }

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

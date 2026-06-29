import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { estadoInsumo } from '@/lib/server/inventario/inventario.service';
import { enviarAlerta } from '@/lib/server/alertas/whatsapp.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const config = await prisma.configuracionAlertas.findUnique({ where: { id: 1 } });
    if (!config) {
      return NextResponse.json({ error: 'Configuración no encontrada' }, { status: 404 });
    }

    // Buscar insumos bajo umbral
    const insumos = await prisma.insumo.findMany();
    const bajoUmbral = insumos.filter(
      (i) => estadoInsumo({ stock_actual: i.stock_actual, stock_minimo: i.stock_minimo, punto_critico: i.punto_critico }) !== 'ok'
    );

    if (bajoUmbral.length === 0) {
      return NextResponse.json({ message: 'No hay insumos bajo el umbral' }, { status: 200 });
    }

    // Forzar el envío saltándose validaciones de horario si se quiere, 
    // pero el spec dice "respetando anti-spam y horario". 
    // La función enviarAlerta ya lo hace.
    const resultado = await enviarAlerta({ insumos: bajoUmbral, cfg: config });

    if (!resultado) {
      return NextResponse.json({ message: 'Alerta ignorada por reglas de anti-spam u horario silencioso' }, { status: 200 });
    }

    return NextResponse.json({ data: resultado, message: 'Alerta enviada' }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { habilitarProductoEnSucursal } from '@/lib/server/productos/catalogo-sucursal.service';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';

const CopiarSchema = z.object({
  /** Sucursal de la que se toman los productos (y sus recetas y precios). */
  origen: z.number().int().positive(),
  /** Sucursal que los recibe. */
  destino: z.number().int().positive(),
  /** Productos a habilitar. Vacío no hace nada: se exige elegir. */
  productos: z.array(z.number().int().positive()).min(1),
  /**
   * Se acepta por compatibilidad con clientes viejos, pero ya no copia nada: el
   * precio del destino siempre arranca en cero. Ver el comentario de abajo.
   */
  copiar_precio: z.boolean().optional(),
});

/**
 * Habilita en lote productos de una sucursal en otra, copiando su ficha técnica.
 *
 * Es el camino para poner en marcha un local nuevo sin recrear el catálogo a
 * mano —que además duplicaría productos con el mismo nombre y partiría los
 * reportes—. Cada producto queda con su propia habilitación: desde ese momento
 * el precio y la receta del destino son independientes del origen.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = CopiarSchema.parse(await req.json());

    if (input.origen === input.destino) {
      throw new ValidationError('El origen y el destino deben ser sucursales distintas');
    }

    // Un ADMIN solo puede traer productos hacia su propia sucursal. El origen se
    // deja libre: es lectura de un catálogo que igual va a ver copiado.
    const permitido = alcanceSucursal(session, input.destino);
    if (permitido !== input.destino) {
      throw new ValidationError('Solo podés habilitar productos en tu propia sucursal');
    }

    // Precio y receta salen de la habilitación del origen, no del catálogo: es
    // lo que el usuario está viendo en pantalla cuando elige copiar.
    const enOrigen = await prisma.productoSucursal.findMany({
      where: { sucursal_id: input.origen, producto_id: { in: input.productos } },
    });
    if (enOrigen.length === 0) {
      throw new ValidationError('Ninguno de los productos elegidos está habilitado en la sucursal de origen');
    }

    // Todo o nada: una copia a medias dejaría productos habilitados sin su ficha
    // técnica, que venden sin descontar insumos.
    const copiados = await prisma.$transaction(async (tx) => {
      for (const fila of enOrigen) {
        await habilitarProductoEnSucursal(fila.producto_id, input.destino, {
          // Precio en cero y fuera de venta: lo que cuesta un plato depende de lo
          // que ESTA sucursal paga por sus insumos, no de lo que paga la otra.
          // Entra como borrador para que no aparezca en la carta a Bs 0 mientras
          // el local le pone su precio.
          precio: 0,
          disponible: false,
          copiar_receta_de: input.origen,
          // La ficha que se trae es la que el origen tiene en pantalla: si le
          // puso nombre o descripción propios, el destino arranca con esos. Lo
          // que el origen heredaba del catálogo se sigue heredando (null), así
          // que no se congelan copias de datos que no cambiaron.
          nombre:             fila.nombre,
          imagen_url:         fila.imagen_url,
          descripcion:        fila.descripcion,
          calorias:           fila.calorias,
          proteina:           fila.proteina,
          estado_publicacion: 'BORRADOR',
        }, tx);
      }
      return enOrigen.length;
    });

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Sucursal', entidadId: input.destino,
      detalle: `Copió ${copiados} producto(s) desde la sucursal #${input.origen} (sin precio ni stock: los carga el local)`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ copiados }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

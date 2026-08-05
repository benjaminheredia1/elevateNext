import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/server/errors';
import { combosVigentes } from '@/lib/server/promociones/combos.service';
import { resolverSucursal } from '@/lib/server/sucursales/sucursal.service';

/**
 * Combos que se pueden vender AHORA en una sucursal.
 *
 * Es la lista que consumen la caja y el menú web: viene filtrada por la ventana
 * horaria del combo, así que fuera de la franja no aparece — y si alguien lo
 * manda igual, la venta lo rechaza con el mismo criterio.
 *
 * El stock NO filtra: un combo agotado se devuelve con `agotado: true` y se
 * puede cobrar, como los productos sueltos. En el mostrador el cajero tiene la
 * mercadería delante aunque el inventario esté sin cargar.
 *
 * Público como el menú: no expone recetas ni costos, solo lo que ve el cliente.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sucursalId = await resolverSucursal(searchParams.get('sucursal'));

    const combos = await combosVigentes(sucursalId);

    return NextResponse.json({
      data: combos.map(c => ({
        id: c.id,
        nombre: c.nombre,
        descripcion: c.descripcion,
        imagen_url: c.imagen_url,
        precio: c.precio,
        precio_lista: c.precio_lista,
        ahorro: c.ahorro,
        vigencia: c.vigencia,
        rinde: c.rinde,
        // Informativo: el combo se puede vender igual. Sirve para avisar en
        // pantalla que se va a descontar stock que no está cargado.
        agotado: c.agotado,
        items: c.items.map(i => ({ producto_id: i.producto_id, nombre: i.nombre, cantidad: i.cantidad })),
      })),
      sucursal_id: sucursalId,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

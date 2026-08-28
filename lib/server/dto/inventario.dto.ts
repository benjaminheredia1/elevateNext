import { z } from 'zod';
import { CAMPOS_HEREDABLES } from '@/lib/server/productos/overrides';

// ── Compra de insumo ───────────────────────────────────────────────
export const RegistrarCompraSchema = z.object({
  insumo_id:     z.number().int().positive(),
  cantidad:      z.number().positive(),
  costo_unitario: z.number().positive(),
  nota:          z.string().optional(),
  // Local donde ocurre el movimiento; sin indicarlo va a la sucursal principal.
  sucursal_id:   z.number().int().positive().optional(),
});
export type RegistrarCompraInput = z.infer<typeof RegistrarCompraSchema>;

// ── Merma ──────────────────────────────────────────────────────────
export const RegistrarMermaSchema = z.object({
  insumo_id:   z.number().int().positive(),
  cantidad:    z.number().positive(),
  descripcion: z.string().min(1),
  // Local donde ocurre el movimiento; sin indicarlo va a la sucursal principal.
  sucursal_id:   z.number().int().positive().optional(),
});
export type RegistrarMermaInput = z.infer<typeof RegistrarMermaSchema>;

// ── Baja de insumo ─────────────────────────────────────────────────
export const RegistrarBajaSchema = z.object({
  insumo_id: z.number().int().positive(),
  motivo:    z.string().min(1),
});
export type RegistrarBajaInput = z.infer<typeof RegistrarBajaSchema>;

export const ReactivarInsumoSchema = z.object({
  insumo_id: z.number().int().positive(),
});
export type ReactivarInsumoInput = z.infer<typeof ReactivarInsumoSchema>;

// ── Conteo físico ──────────────────────────────────────────────────
export const ConteoFisicoSchema = z.object({
  insumo_id:   z.number().int().positive(),
  nuevo_stock: z.number().min(0),
  descripcion: z.string().optional(),
  // Local donde ocurre el movimiento; sin indicarlo va a la sucursal principal.
  sucursal_id:   z.number().int().positive().optional(),
});
export type ConteoFisicoInput = z.infer<typeof ConteoFisicoSchema>;

// ── Producto con ficha técnica ─────────────────────────────────────
const ItemRecetaSchema = z.object({
  insumo_id:          z.number().int().positive(),
  cantidad_utilizada: z.number().positive(),
});

const ImagenProductoSchema = z.string().trim().refine(
  (value) => value.startsWith('/uploads/') || z.string().url().safeParse(value).success,
  'La imagen debe ser una URL válida o una ruta interna /uploads/...',
);

// Datos para crear/actualizar automáticamente el insumo de un producto de reventa
export const NuevoInsumoReventaSchema = z.object({
  unidad_medida:  z.enum(['KG', 'GR', 'UNIDAD', 'LT', 'ML']).default('UNIDAD'),
  stock:          z.number().min(0).default(0),
  costo_unitario: z.number().min(0).default(0),
  punto_reorden:  z.number().min(0).default(0),
  nivel_critico:  z.number().min(0).default(0),
  proveedor:      z.string().optional(),
});
export type NuevoInsumoReventaInput = z.infer<typeof NuevoInsumoReventaSchema>;

export const ProductoConFichaSchema = z.object({
  nombre:             z.string().min(1),
  descripcion:        z.string().optional().default(''),
  precio:             z.number().positive(),
  imagen_url:         ImagenProductoSchema.optional(),
  disponible:         z.boolean().optional().default(true),
  tipo:               z.enum(['ELABORADO', 'REVENTA', 'TERCIADO']).optional().default('ELABORADO'),
  estado_publicacion: z.enum(['BORRADOR', 'PUBLICADO', 'ARCHIVADO']).optional().default('BORRADOR'),
  calorias:           z.number().int().positive().optional(),
  proteina:           z.string().optional(),
  insumo_reventa_id:  z.number().int().positive().optional(),
  nuevo_insumo_reventa: NuevoInsumoReventaSchema.optional(),
  categorias:         z.array(z.number().int().positive()).optional().default([]),
  marcas:             z.array(z.number().int().positive()).optional().default([]),
  receta:             z.array(ItemRecetaSchema).optional().default([]),
  // Sucursal cuya ficha técnica y precio se están editando. Si no viene, se usa
  // la principal: mantiene compatible el alta de producto de una sola sucursal.
  sucursal_id:        z.number().int().positive().optional(),
  /**
   * Campos que esta sucursal quiere HEREDAR del catálogo: se guardan en null y
   * siguen los cambios que haga el dueño. Los que no estén acá quedan propios
   * del local, aunque su valor coincida hoy con el del catálogo.
   *
   * Es la forma explícita de decidirlo. Sin este dato (clientes viejos) se cae
   * a la heurística anterior: coincide con el catálogo = hereda.
   */
  heredar:            z.array(z.enum(CAMPOS_HEREDABLES)).optional(),
  // El alta avisa si ya existe un producto con ese nombre. Con esto en true el
  // usuario confirma que igual quiere uno nuevo (dos platos parecidos).
  permitir_duplicado: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
  // Exclusión de tipos: REVENTA y TERCIADO descuentan 1:1 de su insumo
  // vinculado; si además tuvieran receta, el descuento de stock usaría la
  // receta e ignoraría el insumo (comportamiento ambiguo). La receta de un
  // terciado vive en el Centro (RecetaCentro) y se consume al producir, no al
  // vender: no es la misma receta ni el mismo momento.
  if (data.tipo !== 'ELABORADO' && data.receta.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['receta'],
      message: `Un producto de ${data.tipo} no lleva receta de venta: su inventario es el insumo vinculado 1:1.`,
    });
  }
});
export type ProductoConFichaInput = z.infer<typeof ProductoConFichaSchema>;

// ── Rango de analítica ─────────────────────────────────────────────
// `todo` = sin filtro de fechas: desde el primer registro del negocio hasta hoy.
export const RangoSchema = z.enum(['7d', '30d', '90d', 'todo', 'custom']).default('30d');
export type Rango = z.infer<typeof RangoSchema>;

// ── ConfiguracionAlertas ──────────────────────────────────────────
export const ConfiguracionAlertasSchema = z.object({
  whatsapp_habilitado:  z.boolean().optional(),
  destinatarios:        z.array(z.string()).optional(),
  hora_silencio_desde:  z.string().regex(/^\d{2}:\d{2}$/).optional(),
  hora_silencio_hasta:  z.string().regex(/^\d{2}:\d{2}$/).optional(),
  intervalo_minimo_min: z.number().int().min(1).optional(),
  plantilla_mensaje:    z.string().optional(),
});
export type ConfiguracionAlertasInput = z.infer<typeof ConfiguracionAlertasSchema>;

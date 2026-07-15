import { z } from 'zod';

// ── Compra de insumo ───────────────────────────────────────────────
export const RegistrarCompraSchema = z.object({
  insumo_id:     z.number().int().positive(),
  cantidad:      z.number().positive(),
  costo_unitario: z.number().positive(),
  nota:          z.string().optional(),
});
export type RegistrarCompraInput = z.infer<typeof RegistrarCompraSchema>;

// ── Merma ──────────────────────────────────────────────────────────
export const RegistrarMermaSchema = z.object({
  insumo_id:   z.number().int().positive(),
  cantidad:    z.number().positive(),
  descripcion: z.string().min(1),
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
  tipo:               z.enum(['ELABORADO', 'REVENTA']).optional().default('ELABORADO'),
  estado_publicacion: z.enum(['BORRADOR', 'PUBLICADO', 'ARCHIVADO']).optional().default('BORRADOR'),
  calorias:           z.number().int().positive().optional(),
  proteina:           z.string().optional(),
  insumo_reventa_id:  z.number().int().positive().optional(),
  nuevo_insumo_reventa: NuevoInsumoReventaSchema.optional(),
  categorias:         z.array(z.number().int().positive()).optional().default([]),
  marcas:             z.array(z.number().int().positive()).optional().default([]),
  receta:             z.array(ItemRecetaSchema).optional().default([]),
}).superRefine((data, ctx) => {
  // Exclusión de tipos: REVENTA descuenta 1:1 de su insumo vinculado; si
  // además tuviera receta, el descuento de stock usaría la receta e ignoraría
  // el insumo de reventa (comportamiento ambiguo).
  if (data.tipo === 'REVENTA' && data.receta.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['receta'],
      message: 'Un producto de REVENTA no lleva receta: su inventario es el insumo vinculado 1:1.',
    });
  }
});
export type ProductoConFichaInput = z.infer<typeof ProductoConFichaSchema>;

// ── Rango de analítica ─────────────────────────────────────────────
export const RangoSchema = z.enum(['7d', '30d', '90d']).default('30d');
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

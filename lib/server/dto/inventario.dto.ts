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

export const ProductoConFichaSchema = z.object({
  nombre:             z.string().min(1),
  descripcion:        z.string().min(1),
  precio:             z.number().positive(),
  imagen_url:         ImagenProductoSchema.optional(),
  disponible:         z.boolean().optional().default(true),
  tipo:               z.enum(['ELABORADO', 'REVENTA']).optional().default('ELABORADO'),
  estado_publicacion: z.enum(['BORRADOR', 'PUBLICADO', 'ARCHIVADO']).optional().default('BORRADOR'),
  calorias:           z.number().int().positive().optional(),
  proteina:           z.string().optional(),
  insumo_reventa_id:  z.number().int().positive().optional(),
  categorias:         z.array(z.number().int().positive()).optional().default([]),
  marcas:             z.array(z.number().int().positive()).optional().default([]),
  receta:             z.array(ItemRecetaSchema).optional().default([]),
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

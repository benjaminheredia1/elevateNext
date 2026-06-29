import { z } from 'zod';

const CATEGORIAS = ['Refrigeración', 'Mobiliario', 'Tecnología', 'Vehículos', 'Equipos de cocina', 'Otros'] as const;

export const activoFijoSchema = z.object({
  nombre: z.string().trim().min(2),
  categoria: z.enum(CATEGORIAS),
  fecha_compra: z.coerce.date(),
  valor_original: z.coerce.number().nonnegative(),
  valor_actual: z.coerce.number().nonnegative(),
  depreciacion_pct: z.coerce.number().nonnegative().max(100).optional().nullable(),
  notas: z.string().trim().optional().nullable(),
});

export const activoFijoUpdateSchema = activoFijoSchema.partial().extend({
  id: z.coerce.number().int().positive(),
});

export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type ActivoFijoInput = z.infer<typeof activoFijoSchema>;
export type ActivoFijoUpdateInput = z.infer<typeof activoFijoUpdateSchema>;
export type CategoriaActivo = (typeof CATEGORIAS)[number];
export const CATEGORIAS_ACTIVO = CATEGORIAS;

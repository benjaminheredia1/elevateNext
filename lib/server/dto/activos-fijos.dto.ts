import { z } from 'zod';

const CATEGORIAS = ['Refrigeración', 'Mobiliario', 'Tecnología', 'Vehículos', 'Equipos de cocina', 'Otros'] as const;
// Un activo se paga con lo que hay en el local: efectivo de caja o QR.
const METODOS_PAGO = ['EFECTIVO', 'QR'] as const;

export const activoFijoSchema = z.object({
  nombre: z.string().trim().min(2),
  categoria: z.enum(CATEGORIAS),
  fecha_compra: z.coerce.date(),
  valor_original: z.coerce.number().nonnegative(),
  // Valor en libros. Opcional: si no viene, se deriva del valor original y la
  // depreciación acumulada, que es como lo carga el formulario del admin.
  valor_actual: z.coerce.number().nonnegative().optional(),
  depreciacion_pct: z.coerce.number().nonnegative().max(100).optional().nullable(),
  // Vida útil en años cuando la depreciación se definió por años en vez de por
  // porcentaje. Solo sirve para reabrir el formulario en el mismo modo.
  vida_util_anios: z.coerce.number().int().positive().max(100).optional().nullable(),
  metodo_pago: z.enum(METODOS_PAGO).default('EFECTIVO'),
  notas: z.string().trim().optional().nullable(),
  // Local al que pertenece; si no viene, se usa la sucursal principal.
  sucursal_id: z.coerce.number().int().positive().optional(),
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
export type MetodoPagoActivo = (typeof METODOS_PAGO)[number];
export const CATEGORIAS_ACTIVO = CATEGORIAS;
export const METODOS_PAGO_ACTIVO = METODOS_PAGO;

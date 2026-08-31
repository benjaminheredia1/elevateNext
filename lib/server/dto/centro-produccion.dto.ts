import { z } from 'zod';

export const CrearCentroSchema = z.object({
  nombre:    z.string().trim().min(2).max(120),
  direccion: z.string().trim().max(200).optional(),
});
export type CrearCentroInput = z.infer<typeof CrearCentroSchema>;

export const EditarCentroSchema = z.object({
  nombre:    z.string().trim().min(2).max(120).optional(),
  direccion: z.string().trim().max(200).optional(),
  activo:    z.boolean().optional(),
});
export type EditarCentroInput = z.infer<typeof EditarCentroSchema>;

// ── Insumo bruto del centro ────────────────────────────────────────
export const UnidadMedidaCentroSchema = z.enum(['KG', 'GR', 'UNIDAD', 'LT', 'ML']);

export const AltaInsumoCentroSchema = z.object({
  nombre:         z.string().trim().min(1),
  unidad_medida:  UnidadMedidaCentroSchema.default('UNIDAD'),
  stock_inicial:  z.number().min(0).default(0),
  costo_unitario: z.number().min(0).default(0),
  stock_minimo:   z.number().min(0).default(0),
  punto_critico:  z.number().min(0).default(0),
  // La ficha del insumo es la misma que tenía el alta de la sucursal antes del
  // corte: al mudarse la operación al Centro no puede perder datos por el
  // camino. La categoría ordena el inventario, el proveedor es a quién se le
  // compra, y la equivalencia (1 UNIDAD = 300 GR) es informativa pero es lo que
  // deja entender un costo por bolsa cuando la receta pide gramos.
  categoria_insumo:      z.string().trim().optional(),
  proveedor:             z.string().trim().optional(),
  equivalencia_unidad:   z.string().trim().optional(),
  equivalencia_cantidad: z.number().positive().optional(),
}).superRefine((data, ctx) => {
  // Media equivalencia no dice nada: "1 UNIDAD = ?" o "= 300 ?" son datos
  // inservibles que despues nadie sabe interpretar.
  const tieneUnidad = !!data.equivalencia_unidad;
  const tieneCantidad = data.equivalencia_cantidad != null;
  if (tieneUnidad !== tieneCantidad) {
    ctx.addIssue({
      code: 'custom',
      path: ['equivalencia_cantidad'],
      message: 'La equivalencia necesita la medida y la cantidad, o ninguna de las dos.',
    });
  }
});
export type AltaInsumoCentroInput = z.infer<typeof AltaInsumoCentroSchema>;

export const RegistrarCompraCentroSchema = z.object({
  centro_id:      z.number().int().positive(),
  insumo_id:      z.number().int().positive(),
  cantidad:       z.number().positive(),
  costo_unitario: z.number().positive(),
  nota:           z.string().optional(),
});
export type RegistrarCompraCentroInput = z.infer<typeof RegistrarCompraCentroSchema>;

export const RegistrarMermaCentroSchema = z.object({
  centro_id:   z.number().int().positive(),
  insumo_id:   z.number().int().positive(),
  cantidad:    z.number().positive(),
  descripcion: z.string().min(1),
});
export type RegistrarMermaCentroInput = z.infer<typeof RegistrarMermaCentroSchema>;

export const ConteoFisicoCentroSchema = z.object({
  centro_id:   z.number().int().positive(),
  insumo_id:   z.number().int().positive(),
  nuevo_stock: z.number().min(0),
  descripcion: z.string().optional(),
});
export type ConteoFisicoCentroInput = z.infer<typeof ConteoFisicoCentroSchema>;

export const RegistrarBajaCentroSchema = z.object({
  centro_id: z.number().int().positive(),
  insumo_id: z.number().int().positive(),
  motivo:    z.string().min(1),
});
export type RegistrarBajaCentroInput = z.infer<typeof RegistrarBajaCentroSchema>;

export const ReactivarInsumoCentroSchema = z.object({
  centro_id: z.number().int().positive(),
  insumo_id: z.number().int().positive(),
});
export type ReactivarInsumoCentroInput = z.infer<typeof ReactivarInsumoCentroSchema>;

export const EditarUmbralesCentroSchema = z.object({
  centro_id:     z.number().int().positive(),
  insumo_id:     z.number().int().positive(),
  stock_minimo:  z.number().min(0),
  punto_critico: z.number().min(0),
});
export type EditarUmbralesCentroInput = z.infer<typeof EditarUmbralesCentroSchema>;

// ── Fase 2: producción ─────────────────────────────────────────────
export const DefinirRecetaCentroSchema = z.object({
  centro_id:   z.number().int().positive(),
  producto_id: z.number().int().positive(),
  lineas: z.array(z.object({
    insumo_id:          z.number().int().positive(),
    cantidad_utilizada: z.number().positive(),
  })).min(1),
});
export type DefinirRecetaCentroInput = z.infer<typeof DefinirRecetaCentroSchema>;

export const RegistrarProduccionSchema = z.object({
  centro_id:   z.number().int().positive(),
  producto_id: z.number().int().positive(),
  // Entero: no se producen 2.5 unidades de un producto terminado.
  cantidad:    z.number().int().positive(),
  nota:        z.string().optional(),
});
export type RegistrarProduccionInput = z.infer<typeof RegistrarProduccionSchema>;

// ── Fase 3: traslados ──────────────────────────────────────────────
export const CrearEnvioSchema = z.object({
  centro_id:     z.number().int().positive(),
  sucursal_id:   z.number().int().positive(),
  lineas: z.array(z.object({
    insumo_id: z.number().int().positive(),
    cantidad:  z.number().positive(),
  })).min(1),
  observaciones: z.string().optional(),
});
export type CrearEnvioInput = z.infer<typeof CrearEnvioSchema>;

export const RecibirTrasladoSchema = z.object({
  traslado_id: z.number().int().positive(),
  // Las líneas que no se declaran se dan por recibidas completas.
  recibido: z.array(z.object({
    insumo_id:         z.number().int().positive(),
    cantidad_recibida: z.number().min(0),
  })).default([]),
});
export type RecibirTrasladoInput = z.infer<typeof RecibirTrasladoSchema>;

export const AnularTrasladoSchema = z.object({
  traslado_id: z.number().int().positive(),
  motivo:      z.string().min(1),
});
export type AnularTrasladoInput = z.infer<typeof AnularTrasladoSchema>;

export const ESTADOS_TRASLADO = ['EN_TRANSITO', 'RECIBIDO', 'ANULADO'] as const;

import { z } from 'zod';

const horaRegex = /^([01]\d|2[0-3]):[0-5]\d$/; // "HH:MM" 24h

export const celdaHorarioSchema = z
  .object({
    usuario_id: z.coerce.number().int().positive(),
    dia_semana: z.coerce.number().int().min(1).max(7),
    es_libre: z.boolean().default(false),
    hora_entrada: z.string().regex(horaRegex, 'Formato de hora inválido (HH:MM)').nullable().optional(),
    hora_salida: z.string().regex(horaRegex, 'Formato de hora inválido (HH:MM)').nullable().optional(),
  })
  .refine(c => c.es_libre || (!!c.hora_entrada && !!c.hora_salida), {
    message: 'Si no es día libre, hora de entrada y salida son obligatorias',
    path: ['hora_entrada'],
  })
  .refine(c => c.es_libre || (c.hora_entrada! < c.hora_salida!), {
    message: 'La hora de salida debe ser posterior a la de entrada',
    path: ['hora_salida'],
  });

export const horariosBatchSchema = z.object({
  cambios: z.array(celdaHorarioSchema).min(1).max(200),
});

export const feriadoCreateSchema = z.object({
  fecha: z.coerce.date(),
  nombre: z.string().trim().min(2).max(120),
  sucursal_id: z.coerce.number().int().positive().nullable().optional(),
});

export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CeldaHorarioInput = z.infer<typeof celdaHorarioSchema>;
export type HorariosBatchInput = z.infer<typeof horariosBatchSchema>;
export type FeriadoCreateInput = z.infer<typeof feriadoCreateSchema>;

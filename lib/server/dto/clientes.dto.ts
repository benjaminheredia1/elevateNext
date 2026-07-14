import { z } from 'zod';

/** Campo de texto opcional: '' se normaliza a null (dato ausente). */
const textoOpcional = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));

/**
 * Edición de datos de contacto de un cliente (caja o admin): completar el
 * NIT/celular que faltó al registrarlo, corregir el nombre, etc.
 */
export const editarClienteSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  telefono: textoOpcional(30),
  email: textoOpcional(120),
  nit: textoOpcional(30),
});

export type EditarClienteInput = z.infer<typeof editarClienteSchema>;

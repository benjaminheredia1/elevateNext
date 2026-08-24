import { z } from 'zod';

/** Campo de texto opcional: '' se normaliza a null (dato ausente). */
const textoOpcional = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));

/**
 * Campo que distingue "no lo mandaron" de "lo vaciaron": ausente queda como
 * `undefined` y el service no lo toca. Lo necesita `direccion`, que solo edita
 * la pantalla de admin — si colapsara a null como el resto, cada edición desde
 * caja (que no muestra ese campo) borraría la dirección del cliente.
 */
const textoParcial = (max: number) =>
  z.string().trim().max(max).optional().nullable()
    .transform(v => (v === undefined ? undefined : (v ? v : null)));

/**
 * Edición de datos de contacto de un cliente (caja o admin): completar el
 * NIT/celular que faltó al registrarlo, corregir el nombre, etc.
 */
export const editarClienteSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  telefono: textoOpcional(30),
  email: textoOpcional(120),
  nit: textoOpcional(30),
  direccion: textoParcial(200),
});

export type EditarClienteInput = z.infer<typeof editarClienteSchema>;

/**
 * Alta de cliente desde caja (directorio o POS), sin necesidad de una venta.
 * Los privilegios no se asignan al cliente: se eligen por venta en el POS.
 */
export const crearClienteCajaSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(120),
  telefono: textoOpcional(30),
  email: textoOpcional(120),
  nit: textoOpcional(30),
});

export type CrearClienteCajaInput = z.infer<typeof crearClienteCajaSchema>;

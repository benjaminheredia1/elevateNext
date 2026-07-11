import type { Rol } from '@prisma/client';

export const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

/** Roles considerados "personal" a efectos de horario de trabajadores. */
export const ROLES_TRABAJADOR: Rol[] = ['CAJERO', 'ADMIN'];

export function esRolTrabajador(rol: Rol): boolean {
  return ROLES_TRABAJADOR.includes(rol);
}

export interface CeldaHorario {
  es_libre: boolean;
  hora_entrada: string | null;
  hora_salida: string | null;
}

export interface CeldaHorarioInput extends CeldaHorario {
  usuario_id: number;
  dia_semana: number;
}

const CELDA_DEFAULT: CeldaHorario = { es_libre: false, hora_entrada: null, hora_salida: null };

/** Errores de negocio de una celda (vacío = válida). No reemplaza la validación de formato de Zod. */
export function validarCelda(celda: CeldaHorario): string[] {
  const errores: string[] = [];
  if (celda.es_libre) return errores;

  if (!celda.hora_entrada || !celda.hora_salida) {
    errores.push('Si el día no es libre, la hora de entrada y salida son obligatorias');
    return errores;
  }
  if (celda.hora_salida <= celda.hora_entrada) {
    errores.push('La hora de salida debe ser posterior a la hora de entrada');
  }
  return errores;
}

/** Si es_libre, fuerza las horas a null (ignora cualquier hora enviada por el cliente). */
export function normalizarCelda<T extends CeldaHorario>(celda: T): T {
  if (!celda.es_libre) return celda;
  return { ...celda, hora_entrada: null, hora_salida: null };
}

/** Rellena los 7 días de la semana con defaults para los que no tengan registro. */
export function normalizarSemana(
  registros: Array<{ dia_semana: number } & CeldaHorario>,
): Record<DiaSemana, CeldaHorario> {
  const semana = {} as Record<DiaSemana, CeldaHorario>;
  for (const dia of DIAS_SEMANA) {
    const existente = registros.find(r => r.dia_semana === dia);
    semana[dia] = existente
      ? { es_libre: existente.es_libre, hora_entrada: existente.hora_entrada, hora_salida: existente.hora_salida }
      : { ...CELDA_DEFAULT };
  }
  return semana;
}

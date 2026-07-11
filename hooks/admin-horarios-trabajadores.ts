import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export interface CeldaHorario {
  es_libre: boolean;
  hora_entrada: string | null;
  hora_salida: string | null;
}

export interface TrabajadorHorario {
  usuario_id: number;
  nombre: string;
  rol: 'DUENO' | 'ADMIN' | 'CAJERO' | 'CLIENTE';
  sucursal: { id: number; nombre: string } | null;
  negocio: string;
  dias: Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', CeldaHorario>;
}

export interface CambioCelda extends CeldaHorario {
  usuario_id: number;
  dia_semana: number;
}

export interface Feriado {
  id: number;
  fecha: string;
  nombre: string;
  sucursal_id: number | null;
  sucursal: { id: number; nombre: string } | null;
}

export function useHorariosTrabajadores() {
  return useQuery({
    queryKey: ['admin', 'horarios-trabajadores'],
    queryFn: async () => (await apiClient.get('/api/admin/horarios-trabajadores')).data as { trabajadores: TrabajadorHorario[] },
  });
}

export function useGuardarHorarios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cambios: CambioCelda[]) =>
      (await apiClient.put('/api/admin/horarios-trabajadores', { cambios })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'horarios-trabajadores'] }),
  });
}

export function useDiasFeriados(params?: { sucursal_id?: number; anio?: number }) {
  return useQuery({
    queryKey: ['admin', 'dias-feriados', params],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params?.sucursal_id) search.set('sucursal_id', String(params.sucursal_id));
      if (params?.anio) search.set('anio', String(params.anio));
      const qs = search.toString();
      return (await apiClient.get(`/api/admin/dias-feriados${qs ? `?${qs}` : ''}`)).data as { items: Feriado[] };
    },
  });
}

export function useCrearFeriado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { fecha: string; nombre: string; sucursal_id?: number | null }) =>
      (await apiClient.post('/api/admin/dias-feriados', payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'dias-feriados'] }),
  });
}

export function useEliminarFeriado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.delete(`/api/admin/dias-feriados?id=${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'dias-feriados'] }),
  });
}

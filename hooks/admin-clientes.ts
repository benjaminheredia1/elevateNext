import { useQuery } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

/** Único período de la pantalla: filtra la lista y las métricas. */
export interface PeriodoClientes {
  rango: 'hoy' | '7d' | 'mes' | 'custom' | 'todo';
  desde?: string;
  hasta?: string;
}

/**
 * Filtro de la pantalla de clientes como query string. Lo comparten la tabla y
 * la descarga en Excel, para que el archivo traiga exactamente lo que se ve.
 */
export function paramsClientes(q = '', periodo?: PeriodoClientes) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (periodo) {
    params.set('rango', periodo.rango);
    // Solo el rango a medida necesita las fechas; el resto las deriva el
    // servidor del día de negocio.
    if (periodo.rango === 'custom') {
      if (periodo.desde) params.set('desde', periodo.desde);
      if (periodo.hasta) params.set('hasta', periodo.hasta);
    }
  }
  return params.toString();
}

export function useAdminClientes(q = '', periodo?: PeriodoClientes) {
  return useQuery({
    queryKey: ['admin', 'clientes', q, periodo?.rango, periodo?.desde, periodo?.hasta],
    queryFn: async () => {
      const qs = paramsClientes(q, periodo);
      return (await apiClient.get(`/api/admin/clientes${qs ? `?${qs}` : ''}`)).data;
    },
  });
}

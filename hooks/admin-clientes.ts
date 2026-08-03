import { useQuery } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

/** Período que filtra la lista, aparte del mes de fidelización. */
export interface PeriodoClientes {
  rango: 'hoy' | '7d' | 'mes' | 'custom' | 'todo';
  desde?: string;
  hasta?: string;
}

export function useAdminClientes(q = '', mes = '', periodo?: PeriodoClientes) {
  return useQuery({
    queryKey: ['admin', 'clientes', q, mes, periodo?.rango, periodo?.desde, periodo?.hasta],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (mes) params.set('mes', mes);
      if (periodo) {
        params.set('rango', periodo.rango);
        // Solo el rango a medida necesita las fechas; el resto las deriva el
        // servidor del día de negocio.
        if (periodo.rango === 'custom') {
          if (periodo.desde) params.set('desde', periodo.desde);
          if (periodo.hasta) params.set('hasta', periodo.hasta);
        }
      }
      const qs = params.toString();
      return (await apiClient.get(`/api/admin/clientes${qs ? `?${qs}` : ''}`)).data;
    },
  });
}

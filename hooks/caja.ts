import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

type MetodoPago = 'EFECTIVO' | 'QR' | 'TARJETA';

export interface AperturaCajaInput {
  apertura_efectivo: number;
  apertura_qr: number;
  observaciones?: string;
}

export interface MovimientoManualInput {
  concepto: string;
  monto: number;
  metodo_pago: MetodoPago;
  categoria?: string;
}

export interface VentaFisicaInput {
  items: { producto_id: number; cantidad: number }[];
  metodo_pago: MetodoPago;
  es_cortesia?: boolean;
  es_fiado?: boolean;
  fiado_vencimiento?: string | null;
  cliente_id?: number;
  cliente_nombre?: string;
  cliente_telefono?: string;
  cliente_email?: string;
  cliente_nit?: string;
  cliente_anonimo?: boolean;
}

export interface CierreCajaInput {
  real_efectivo: number;
  real_qr: number;
  observaciones?: string;
}

export interface ClienteResultado {
  id: number;
  nombre: string;
  telefono: string | null;
  nit: string | null;
  email: string | null;
  descuento_pct?: number;
  descuento_nombre?: string | null;
}

export function useBuscarClientes(q: string) {
  return useQuery({
    queryKey: ['caja', 'clientes', q],
    queryFn: async () => {
      const res = await apiClient.get(`/api/caja/clientes?q=${encodeURIComponent(q)}`);
      return res.data.data as ClienteResultado[];
    },
    enabled: q.trim().length >= 2,
  });
}

export function useDeudores() {
  return useQuery({
    queryKey: ['caja', 'deudores'],
    queryFn: async () => (await apiClient.get('/api/caja/deudores')).data,
  });
}

export function useCobrarDeuda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, monto, metodo_pago }: { id: number; monto: number; metodo_pago: 'EFECTIVO' | 'QR' }) =>
      (await apiClient.post(`/api/caja/deudores/${id}/pago`, { monto, metodo_pago })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja', 'deudores'] });
      qc.invalidateQueries({ queryKey: ['caja', 'turno-activo'] });
    },
  });
}

const cajaKey = ['caja'] as const;

export function useTurnoActivo() {
  return useQuery({
    queryKey: [...cajaKey, 'turno-activo'],
    queryFn: async () => {
      const res = await apiClient.get('/api/caja/turno-activo');
      return res.data;
    },
  });
}

export function useResumenRepartidores() {
  return useQuery({
    queryKey: [...cajaKey, 'repartidores'],
    queryFn: async () => {
      const res = await apiClient.get('/api/caja/repartidores');
      return res.data?.data as {
        turno: { id: number; fecha_apertura: string } | null;
        repartidores: { repartidor: string; pedidos: number; en_curso: number; entregados: number; efectivo_adelantado: number; total: number }[];
      };
    },
  });
}

export function useMovimientos() {
  return useQuery({
    queryKey: [...cajaKey, 'movimientos'],
    queryFn: async () => {
      const res = await apiClient.get('/api/caja/movimientos');
      return res.data;
    },
  });
}

export function useHistorial() {
  return useQuery({
    queryKey: [...cajaKey, 'historial'],
    queryFn: async () => {
      const res = await apiClient.get('/api/caja/historial');
      return res.data;
    },
  });
}

export function useTurnoDetalle(turnoId: number | null) {
  return useQuery({
    queryKey: [...cajaKey, 'historial', turnoId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/caja/historial/${turnoId}`);
      return res.data;
    },
    enabled: turnoId != null,
  });
}

function useCajaMutation<TInput>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) => {
      const res = await apiClient.post(path, input);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cajaKey });
    },
  });
}

export function useAbrirCaja() {
  return useCajaMutation<AperturaCajaInput>('/api/caja/apertura');
}

export function useRegistrarIngreso() {
  return useCajaMutation<MovimientoManualInput>('/api/caja/ingreso');
}

export function useRegistrarGasto() {
  return useCajaMutation<MovimientoManualInput>('/api/caja/gasto');
}

export function useRegistrarVenta() {
  return useCajaMutation<VentaFisicaInput>('/api/caja/venta');
}

export function useCerrarCaja() {
  return useCajaMutation<CierreCajaInput>('/api/caja/cierre');
}

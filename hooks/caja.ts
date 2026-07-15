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
  metodo_pago: MetodoPago | 'MIXTO';
  /** Obligatorio cuando metodo_pago = MIXTO; debe sumar exactamente el total. */
  pago_mixto?: { efectivo: number; qr: number };
  /** Abono a la deuda del cliente cobrado junto con la venta (Bs). */
  abono_deuda?: number;
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

export interface PrivilegioResumen {
  id: number;
  nombre: string;
  porcentaje: number;
  descripcion?: string | null;
}

export interface ClienteResultado {
  id: number;
  nombre: string;
  telefono: string | null;
  nit: string | null;
  email: string | null;
  privilegios?: PrivilegioResumen[];
  /** Saldo total de fiados pendientes (Bs). */
  deuda_saldo?: number;
  descuento_pct?: number;
  descuento_nombre?: string | null;
}

/** Directorio de clientes para la página Clientes de caja (navega sin búsqueda). */
export function useClientesDirectorio(q: string) {
  return useQuery({
    queryKey: ['caja', 'clientes-directorio', q],
    queryFn: async () => {
      const res = await apiClient.get(`/api/caja/clientes?browse=1&q=${encodeURIComponent(q)}`);
      return res.data.data as ClienteResultado[];
    },
  });
}

/** Privilegios activos (los únicos asignables desde caja). */
export function usePrivilegiosCaja() {
  return useQuery({
    queryKey: ['caja', 'privilegios'],
    queryFn: async () => (await apiClient.get('/api/caja/privilegios')).data.data as PrivilegioResumen[],
  });
}

export interface EditarClienteInput {
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  nit?: string | null;
}

export function useEditarCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clienteId, datos }: { clienteId: number; datos: EditarClienteInput }) =>
      (await apiClient.put(`/api/caja/clientes/${clienteId}`, datos)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja', 'clientes-directorio'] });
      qc.invalidateQueries({ queryKey: ['caja', 'clientes'] });
    },
  });
}

export interface CrearClienteCajaInput {
  nombre: string;
  telefono?: string;
  email?: string;
  nit?: string;
  privilegio_ids?: number[];
}

/** Alta de cliente desde caja (sin venta), con privilegios opcionales. */
export function useCrearClienteCaja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (datos: CrearClienteCajaInput) =>
      (await apiClient.post('/api/caja/clientes', datos)).data.data as ClienteResultado,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja', 'clientes-directorio'] });
      qc.invalidateQueries({ queryKey: ['caja', 'clientes'] });
    },
  });
}

/** Cobro de deuda sin compra (FIFO sobre los fiados del cliente). */
export function useAbonarDeuda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clienteId, monto, metodo_pago }: { clienteId: number; monto: number; metodo_pago: 'EFECTIVO' | 'QR' | 'TARJETA' }) =>
      (await apiClient.post(`/api/caja/clientes/${clienteId}/abono`, { monto, metodo_pago })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja'] });
    },
  });
}

export function useAsignarPrivilegios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clienteId, privilegioIds }: { clienteId: number; privilegioIds: number[] }) =>
      (await apiClient.put(`/api/caja/clientes/${clienteId}/privilegios`, { privilegio_ids: privilegioIds })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja', 'clientes-directorio'] });
      qc.invalidateQueries({ queryKey: ['caja', 'clientes'] });
    },
  });
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

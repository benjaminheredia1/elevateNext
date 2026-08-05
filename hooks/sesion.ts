'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth';

/**
 * Usuario de la sesión actual (rol y sucursal asignada), cacheado para que las
 * pantallas no repitan la llamada a /me.
 *
 * Sirve para decidir qué mostrar, nunca para autorizar: el encierro por sucursal
 * lo aplica el servidor en `alcanceSucursal`. Acá solo se evita ofrecer un
 * control que la API va a ignorar.
 */
export function useSesion() {
  const { data, isLoading } = useQuery({
    queryKey: ['sesion'],
    queryFn: useAuth.me,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    sesion: data,
    cargando: isLoading,
    /** Único rol con visión de todo el negocio y capacidad de comparar locales. */
    esDueno: data?.rol === 'DUENO',
  };
}

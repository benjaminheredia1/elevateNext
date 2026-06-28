'use client';

import { useQuery } from '@tanstack/react-query';
import { useReglas } from '@/hooks/reglas';

export function reglasGet() {
  const { data: horarios, isLoading, isError, error } = useQuery({
    queryKey: ['reglas-horarias'],
    queryFn: useReglas.fetchAll,
  });

  return { horarios, isLoading, isError, error };
}

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCategories } from '@/hooks/category';

export function listCategory() {
  const { data: categories, isLoading, isError, error } = useQuery({
    queryKey: ['categories'],
    queryFn: useCategories.fetchCategoriesAll,
  });
  return { categories, isLoading, isError, error };
}

export function postCategory() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: useCategories.postCategoriesRestaurant,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); },
    onError: (error) => { console.error('Error al crear la categoría:', error); },
  });
  return { createCategory: mutation.mutate, createCategoryAsync: mutation.mutateAsync, data: mutation.data, isPending: mutation.isPending, isError: mutation.isError, error: mutation.error };
}

export function DeleteCategory() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: useCategories.deleteCategory,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); },
    onError: (error) => { console.error('Error al eliminar la categoría:', error); },
  });
  return { deleteCategory: mutation.mutate, deleteCategoryAsync: mutation.mutateAsync, data: mutation.data, isPending: mutation.isPending, isError: mutation.isError, error: mutation.error };
}

export function EditCategory() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: useCategories.putCategory,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); },
    onError: (error) => { console.error('Error al editar la categoría:', error); },
  });
  return { editCategory: mutation.mutate, editCategoryAsync: mutation.mutateAsync, data: mutation.data, isPending: mutation.isPending, isError: mutation.isError, error: mutation.error };
}

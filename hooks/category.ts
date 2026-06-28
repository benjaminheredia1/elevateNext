import API from './api';

export const useCategories = {
  fetchCategoriesAll: async () => {
    try {
      return await API.get('/api/categoria');
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }
  },
  postCategoriesRestaurant: async (data: { nombre: string; detalles: string }) => {
    try {
      return await API.post('/api/categoria', data);
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  },
  deleteCategory: async (id: number) => {
    try {
      return await API.delete(`/api/categoria/${id}`);
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  },
  putCategory: async (data: { id: number; nombre: string; detalles: string }) => {
    try {
      return await API.put(`/api/categoria/${data.id}`, data);
    } catch (error) {
      console.error('Error editing category:', error);
      throw error;
    }
  },
};

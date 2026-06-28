import API from './api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export const useReglas = {
  fetchAll: async () => {
    try {
      return await API.get(`${BASE_URL}/api/reglas-horarias`);
    } catch (error) {
      console.error('Error fetching reglas:', error);
      throw error;
    }
  },
  create: async (data: { promocionesDescuentos_id: number; fecha_inicio: string; fecha_fin: string }) => {
    try {
      return await API.post(`${BASE_URL}/api/reglas-horarias`, data);
    } catch (error) {
      console.error('Error creating regla:', error);
      throw error;
    }
  },
  delete: async (id: number) => {
    try {
      return await API.delete(`${BASE_URL}/api/reglas-horarias/${id}`);
    } catch (error) {
      console.error('Error deleting regla:', error);
      throw error;
    }
  },
};

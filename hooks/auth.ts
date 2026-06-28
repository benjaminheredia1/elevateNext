import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const apiClient = axios.create({
  baseURL: `${BASE_URL}/api/auth`,
  headers: { 'Content-Type': 'application/json' },
});

export const useAuth = {
  login: async (email: string, password: string) => {
    try {
      const response = await apiClient.post('/login', { email, password });
      const body = response.data;
      const token = body.access_token;
      if (typeof window !== 'undefined') localStorage.setItem('token', token);
      return response;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },
  verify: async (token: string) => {
    try {
      const response = await apiClient.post('/validate', { token });
      return response.status === 200 || response.status === 201;
    } catch {
      return false;
    }
  },
};

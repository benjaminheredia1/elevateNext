import axios from 'axios';
import type { Rol } from '@prisma/client';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const apiClient = axios.create({
  baseURL: BASE_URL ? `${BASE_URL}/api/auth` : '/api/auth',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

/** A qué área pertenece cada rol tras login. */
export function homeForRole(rol?: string): string {
  switch (rol) {
    case 'DUENO':
    case 'ADMIN':
      return '/admin';
    case 'CAJERO':
      return '/caja';
    default:
      return '/';
  }
}

export const useAuth = {
  login: async (identifier: string, password: string) => {
    // La sesión queda en una cookie httpOnly seteada por el servidor;
    // el token NO se guarda en localStorage (mitiga robo por XSS).
    const response = await apiClient.post('/login', { identifier, password });
    return response.data as { access_token: string; user: { rol: Rol; nombre: string; id: number } };
  },

  me: async () => {
    const res = await apiClient.get('/me'); // autenticado por cookie
    return res.data as { id: number; nombre: string; rol: Rol; sucursal_id: number | null };
  },

  verify: async (token: string) => {
    try {
      const response = await apiClient.post('/validate', { token });
      return response.status === 200 || response.status === 201;
    } catch {
      return false;
    }
  },

  logout: () => {
    // Borra la cookie httpOnly en el servidor (el JS no puede tocarla).
    // fire-and-forget: no bloquea la redirección a /login.
    apiClient.post('/logout').catch(() => {});
    if (typeof window !== 'undefined') {
      // Limpieza de valores heredados del esquema anterior (localStorage)
      localStorage.removeItem('token');
      localStorage.removeItem('rol');
      localStorage.removeItem('user');
    }
  },

  forgotPassword: async (email: string) => {
    const response = await apiClient.post('/forgot-password', { email });
    return response.data as { message: string };
  },

  resetPassword: async (token: string, password: string) => {
    const response = await apiClient.post('/reset-password', { token, password });
    return response.data as { message: string };
  },
};

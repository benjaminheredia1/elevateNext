import axios from 'axios';
import type { Rol } from '@prisma/client';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const apiClient = axios.create({
  baseURL: `${BASE_URL}/api/auth`,
  headers: { 'Content-Type': 'application/json' },
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

function authHeader() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const useAuth = {
  login: async (email: string, password: string) => {
    const response = await apiClient.post('/login', { email, password });
    const body = response.data; // { access_token, user }
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', body.access_token);
      if (body.user?.rol) localStorage.setItem('rol', body.user.rol);
    }
    return body as { access_token: string; user: { rol: Rol; nombre: string; id: number } };
  },

  me: async () => {
    const res = await apiClient.get('/me', { headers: authHeader() });
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('rol');
    }
  },
};

import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// La sesión viaja en una cookie httpOnly (seteada por /api/auth/login);
// el navegador la adjunta solo en peticiones same-origin, sin interceptor.

apiClient.interceptors.response.use((response) => response, (error) => {
  if (typeof window !== 'undefined' && error?.response?.status === 401) {
    window.location.href = '/login';
  }
  return Promise.reject(error);
});

export default apiClient;

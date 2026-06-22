import axios from 'axios';

// En desarrollo: VITE_API_BASE_URL=http://localhost:3000/api  (.env.development)
// En producción: sin variable → usa '/api' (Nginx hace proxy a Node.js)
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

// Token en memoria — se hidrata desde sessionStorage al arrancar la app
let _token: string | null = null;

export function setToken(t: string | null) {
  _token = t;
}

export function getToken(): string | null {
  return _token;
}

// Instancia axios compartida por toda la app.
// El interceptor inyecta el Bearer token en cada request automáticamente.
export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  if (_token) config.headers['Authorization'] = `Bearer ${_token}`;
  return config;
});

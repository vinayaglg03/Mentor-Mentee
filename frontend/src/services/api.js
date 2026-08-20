import axios from 'axios';

// Set VITE_API_URL when building/deploying (e.g. https://your-api.onrender.com/api)
const baseURL =
  import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') ||
  import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: baseURL.endsWith('/api') ? baseURL : `${baseURL}/api`,
});

// Request interceptor for API calls
api.interceptors.request.use(
  async config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Response interceptor for API calls
api.interceptors.response.use((response) => {
  return response
}, async function (error) {
  // 401 means the session is gone, so log out. A 403 means the user is
  // signed in but not allowed to do this one thing - the caller shows an
  // inline error instead of being kicked out of the app.
  if (error.response?.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
  return Promise.reject(error);
});

export default api;

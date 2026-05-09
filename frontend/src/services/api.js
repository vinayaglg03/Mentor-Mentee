import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
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
  if (error.response?.status === 401 || error.response?.status === 403) {
      // Force logout on 401 or Invalid Token
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
  }
  return Promise.reject(error);
});

export default api;

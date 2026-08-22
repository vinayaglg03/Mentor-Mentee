import axios from 'axios';

// Set VITE_API_URL when building/deploying (e.g. https://your-api.onrender.com)
const DEFAULT_API_URL = 'http://localhost:5000';

const configuredURL = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');

if (!configuredURL) {
  console.warn(
    `VITE_API_URL is not set - falling back to ${DEFAULT_API_URL}. ` +
    'Create frontend/.env from .env.example before deploying.'
  );
}

const baseURL = configuredURL || DEFAULT_API_URL;

export const apiRoot = baseURL.endsWith('/api') ? baseURL : `${baseURL}/api`;

const api = axios.create({
  baseURL: apiRoot,
  // The refresh token is an httpOnly cookie, so every call has to carry it.
  withCredentials: true,
});

// The access token is held here, in memory only. It is deliberately not in
// localStorage: anything that can run script on the page can read that, and
// a token in memory dies with the tab.
let accessToken = null;
let onSessionLost = null;

export const setAccessToken = (token) => { accessToken = token; };
export const getAccessToken = () => accessToken;
export const onSessionExpired = (handler) => { onSessionLost = handler; };

// A single refresh in flight, shared by every request that gets a 401, so a
// page with six panels does not fire six refreshes.
let refreshInFlight = null;

export const refreshSession = async () => {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(`${apiRoot}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        accessToken = data.token;
        return data;
      })
      .finally(() => { refreshInFlight = null; });
  }

  return refreshInFlight;
};

api.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    // Remembered so the "Report a problem" form can quote the failure the
    // user actually hit.
    const requestId = error.response?.data?.requestId || error.response?.headers?.['x-request-id'];
    if (requestId) window.__amisLastRequestId = requestId;

    // 401 means the access token has expired: refresh once and replay. A 403
    // means signed in but not allowed, and the caller shows an inline error
    // rather than being kicked out of the app.
    if (status === 401 && original && !original.__retried && !original.url?.includes('/auth/refresh')) {
      original.__retried = true;

      try {
        await refreshSession();
        return api(original);
      } catch {
        accessToken = null;
        if (onSessionLost) onSessionLost();
      }
    }

    return Promise.reject(error);
  }
);

export default api;

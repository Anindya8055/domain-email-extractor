// client/src/services/api.js
import axios from 'axios';

function resolveApiBase() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('apiBase');
    if (fromQuery) return fromQuery;
  } catch {}

  if (window.__APP_CONFIG__?.apiBase) {
    return window.__APP_CONFIG__.apiBase;
  }

  return 'http://127.0.0.1:4000/api';
}

const apiBase = resolveApiBase();

const api = axios.create({
  baseURL: apiBase,
  timeout: 30000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.error ||
      err.response?.data?.message ||
      err.message ||
      'Request failed';

    return Promise.reject(new Error(message));
  }
);

export const uploadFile = (file, onProgress) => {
  const form = new FormData();
  form.append('file', file);

  return api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (!onProgress) return;

      if (!e.total) {
        onProgress(0);
        return;
      }

      onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
};

export const getJobStatus = (jobId) => api.get(`/jobs/${jobId}`);

export const getJobDomains = (jobId, page = 1, limit = 100) =>
  api.get(`/jobs/${jobId}/domains`, {
    params: { page, limit },
  });

export const getDownloadUrl = (jobId) => `${apiBase}/jobs/${jobId}/download`;

export const deleteJob = (jobId) => api.delete(`/jobs/${jobId}`);

export const getSettings = () => api.get('/settings');
export const getSettingsDebug = () => api.get('/settings/debug');
export const saveSettings = (payload) => api.post('/settings', payload);

export default api;
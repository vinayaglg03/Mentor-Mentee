import api from './api';

// Fetches a binary export through the authenticated api instance and hands it
// to the browser as a download.
export const downloadFile = async (path, params, fileName) => {
  const { data } = await api.get(path, { params, responseType: 'blob' });

  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

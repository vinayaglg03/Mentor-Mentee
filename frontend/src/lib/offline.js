// Registers the service worker and exposes the two things the UI needs to
// say out loud: whether we are offline, and whether anything the user did is
// still waiting to be sent.

const listeners = new Set();

const state = {
  online: navigator.onLine,
  queued: 0,
  lastFlush: null,
};

const emit = () => {
  for (const listener of listeners) listener({ ...state });
};

export const subscribeToConnection = (listener) => {
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
};

export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;

  // The dev server does not serve the worker; registering it there would
  // cache Vite's module graph and cause very confusing stale reloads.
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An install failure only costs offline support, not the app.
    });
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'amis-write-queued') {
      state.queued += 1;
      emit();
    }

    if (event.data?.type === 'amis-queue-flushed') {
      state.queued = Math.max(0, state.queued - (event.data.replayed + event.data.failed));
      state.lastFlush = { at: Date.now(), ...event.data };
      emit();
    }
  });
};

const setOnline = (online) => {
  state.online = online;
  emit();

  if (online && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'amis-flush' });
  }
};

window.addEventListener('online', () => setOnline(true));
window.addEventListener('offline', () => setOnline(false));

// Response headers the worker adds, so a screen can say how old what it is
// showing actually is.
export const cachedAtFrom = (response) => {
  const stamp = response?.headers?.['x-amis-cached-at'] || response?.headers?.get?.('X-AMIS-Cached-At');
  return stamp ? new Date(stamp) : null;
};

export const wasQueuedOffline = (response) => response?.status === 202 && response?.data?.queued === true;

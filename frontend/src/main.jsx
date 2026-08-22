import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initMonitoring } from './lib/monitoring';
import { registerServiceWorker } from './lib/offline';

// No-op unless VITE_SENTRY_DSN is set.
initMonitoring();

// Offline support: app shell cached, reads served from cache, writes queued.
registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

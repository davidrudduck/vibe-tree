// import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from '@vibetree/auth';
import { ErrorBoundary } from '@vibetree/ui';
import App from './App';
import './styles/globals.css';

/**
 * Determine the full server URL for API/auth calls from the current page location and VITE_SERVER_PORT.
 *
 * @returns The URL composed of the page protocol, hostname, and port (the validated `VITE_SERVER_PORT` value if between 1 and 65535, otherwise `3002`)
 */
function getServerUrl(): string {
  const { hostname, protocol } = window.location;
  const envPort = import.meta.env.VITE_SERVER_PORT;
  let serverPort = 3002;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 65535) {
      serverPort = parsed;
    }
  }
  return `${protocol}//${hostname}:${serverPort}`;
}

// Global error handlers
window.addEventListener('error', (e) => {
  console.error('[Global] Uncaught error:', e.error);
  e.preventDefault();
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Global] Unhandled promise rejection:', e.reason);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  // Temporarily disable StrictMode to fix terminal character duplication
  // <React.StrictMode>
  <ErrorBoundary
    onError={(error, info) => {
      console.error('[App Crash]', error, info.componentStack);
      // TODO: When database is available, send error to server for logging
    }}
  >
    <AuthProvider serverUrl={getServerUrl()}>
      <App />
    </AuthProvider>
  </ErrorBoundary>
  // </React.StrictMode>
);
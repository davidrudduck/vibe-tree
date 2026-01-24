// import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from '@vibetree/auth';
import { ErrorBoundary } from '@vibetree/ui';
import App from './App';
import './styles/globals.css';

/**
 * Auto-detect server URL based on current page location.
 * Uses VITE_SERVER_PORT environment variable or defaults to port 3002.
 * @returns The full server URL including protocol, hostname, and port
 */
function getServerUrl(): string {
  const { hostname, protocol } = window.location;
  const serverPort = import.meta.env.VITE_SERVER_PORT || '3002';
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
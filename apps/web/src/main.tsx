// import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from '@vibetree/auth';
import { ErrorBoundary } from '@vibetree/ui';
import App from './App';
import { getServerHttpUrl } from './services/portDiscovery';
import './styles/globals.css';

// Global error handlers
window.addEventListener('error', (e) => {
  console.error('[Global] Uncaught error:', e.error);
  e.preventDefault();
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Global] Unhandled promise rejection:', e.reason);
});

async function main() {
  const serverUrl = await getServerHttpUrl();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    // Temporarily disable StrictMode to fix terminal character duplication
    // <React.StrictMode>
    <ErrorBoundary
      onError={(error, info) => {
        console.error('[App Crash]', error, info.componentStack);
        // TODO: When database is available, send error to server for logging
      }}
    >
      <AuthProvider serverUrl={serverUrl}>
        <App />
      </AuthProvider>
    </ErrorBoundary>
    // </React.StrictMode>
  );
}

main();

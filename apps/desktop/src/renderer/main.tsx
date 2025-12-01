import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from '@vibetree/ui';
import './styles/globals.css';

// Global error handlers - enhanced with ErrorBoundary prevention
window.addEventListener('error', (e) => {
  console.error('[Global] Uncaught error:', e.error);
  // Prevent the app from crashing - let ErrorBoundary handle it
  e.preventDefault();
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Global] Unhandled promise rejection:', e.reason);
  // Log but don't crash
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Root element not found!');
} else {
  console.log('Rendering app...');
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary
        onError={(error, info) => {
          // Log error for future database error logging
          console.error('[App Crash]', error, info.componentStack);
          // TODO: When database is available, log to error_logs table
        }}
      >
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
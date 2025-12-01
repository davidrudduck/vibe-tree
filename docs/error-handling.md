# Error Handling & Resilience

This document describes the error handling and resilience improvements implemented in VibeTree to prevent crashes and provide graceful degradation.

## Overview

VibeTree implements multiple layers of error handling to ensure the application remains stable even when unexpected errors occur:

1. **React ErrorBoundary** - Catches rendering errors
2. **Path Validation** - Prevents file system errors
3. **Safe Singletons** - Prevents initialization crashes
4. **WebSocket Retry Logic** - Handles network failures
5. **Port Fallback** - Automatic port selection
6. **Global Error Handlers** - Last resort error catching

## React ErrorBoundary

### Purpose

Catches errors in React component trees and displays a fallback UI instead of crashing the entire application.

### Implementation

```typescript
import { ErrorBoundary } from '@vibetree/ui';

<ErrorBoundary
  onError={(error, info) => {
    console.error('[App Crash]', error, info.componentStack);
  }}
>
  <App />
</ErrorBoundary>
```

### Features

- **Fallback UI**: Shows error message with "Try Again" button
- **Error Logging**: Logs to console with component stack trace
- **Recovery**: Users can attempt to recover by clicking "Try Again"
- **Custom Fallback**: Optional custom fallback component

### Usage in Apps

**Desktop App** (`apps/desktop/src/renderer/main.tsx`):
```typescript
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary
      onError={(error, info) => {
        console.error('[App Crash]', error, info.componentStack);
      }}
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
```

**Web App** (`apps/web/src/main.tsx`):
```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary onError={(error, info) => {
    console.error('[App Crash]', error, info.componentStack);
  }}>
    <AuthProvider serverUrl={getServerUrl()}>
      <App />
    </AuthProvider>
  </ErrorBoundary>
);
```

## Path Validation

### Purpose

Validates file and directory paths before operations to prevent "file not found" crashes.

### Validation Functions

Located in `packages/core/src/utils/validation.ts`:

#### validateFilePath
```typescript
import { validateFilePath } from '@vibetree/core';

const result = validateFilePath('/path/to/file.txt');
if (!result.valid) {
  console.error(result.error);
  // Handle error gracefully
} else {
  // Safe to use result.resolvedPath
}
```

**Checks**:
- File exists
- Path is a file (not directory)
- File is readable

#### validateDirectoryPath
```typescript
import { validateDirectoryPath } from '@vibetree/core';

const result = validateDirectoryPath('/path/to/dir');
if (!result.valid) {
  console.error(result.error);
} else {
  // Safe to use result.resolvedPath
}
```

**Checks**:
- Directory exists
- Path is a directory (not file)
- Directory is accessible

#### validateWorkerScript
```typescript
import { validateWorkerScript } from '@vibetree/core';

const result = validateWorkerScript('/path/to/worker.cjs');
if (!result.valid) {
  console.error(result.error);
} else {
  // Worker script is valid and readable
}
```

**Checks**:
- File exists and is readable
- File contains expected worker code patterns
- File is not empty

#### Batch Validation
```typescript
import { validatePaths, allValid, getFirstInvalid } from '@vibetree/core';

const paths = ['/path/one', '/path/two', '/path/three'];
const results = validatePaths(paths, validateDirectoryPath);

if (allValid(results)) {
  // All paths are valid
} else {
  const firstError = getFirstInvalid(results);
  console.error('Validation failed:', firstError?.error);
}
```

### ValidationResult Interface

```typescript
interface ValidationResult {
  valid: boolean;
  error?: string;
  resolvedPath?: string; // Absolute path if valid
}
```

### Usage Example

**Worker Script Validation** (`apps/desktop/src/main/shell-manager.ts`):
```typescript
private getWorkerScriptPath(): string {
  const tryPaths = [
    path.join(__dirname, '../../../../packages/core/dist/workers/pty-worker.cjs'),
    path.join(app.getAppPath(), 'node_modules/@vibetree/core/dist/workers/pty-worker.cjs'),
    path.join(app.getAppPath(), 'resources', 'pty-worker.cjs'),
  ];

  for (const workerPath of tryPaths) {
    const validation = validateWorkerScript(workerPath);
    if (validation.valid) {
      console.log('[Worker] Validated:', validation.resolvedPath);
      return validation.resolvedPath!;
    }
    console.warn('[Worker] Validation failed:', validation.error);
  }

  throw new Error(`Worker script not found. Tried:\n${tryPaths.join('\n')}`);
}
```

## Safe Singleton Pattern

### Purpose

Prevents crashes when singleton services are accessed before initialization.

### Implementation

**TerminalForkManager** (`packages/core/src/services/TerminalForkManager.ts`):

```typescript
export class TerminalForkManager {
  private static instance: TerminalForkManager | null = null;
  private static defaultWorkerPath: string | null = null;

  // Safe getter - throws descriptive error
  static getInstance(): TerminalForkManager {
    if (!TerminalForkManager.instance) {
      if (TerminalForkManager.defaultWorkerPath) {
        console.warn('[TerminalForkManager] Auto-initializing with default path');
        return TerminalForkManager.initialize(TerminalForkManager.defaultWorkerPath);
      }
      throw new Error('TerminalForkManager not initialized. Call initialize() first.');
    }
    return TerminalForkManager.instance;
  }

  // Check without throwing
  static tryGetInstance(): TerminalForkManager | null {
    return TerminalForkManager.instance;
  }

  // Check initialization state
  static isInitialized(): boolean {
    return TerminalForkManager.instance !== null;
  }

  // Set default for auto-init
  static setDefaultWorkerPath(path: string): void {
    TerminalForkManager.defaultWorkerPath = path;
  }
}
```

### Usage

```typescript
// Set default path early
TerminalForkManager.setDefaultWorkerPath('/path/to/worker.cjs');

// Safe check before use
if (TerminalForkManager.isInitialized()) {
  const manager = TerminalForkManager.getInstance();
}

// Or use try version
const manager = TerminalForkManager.tryGetInstance();
if (manager) {
  // Use manager
}
```

## WebSocket Retry Logic

### Purpose

Automatically retry failed WebSocket operations with exponential backoff.

### Implementation

**WebSocketAdapter** (`apps/web/src/adapters/WebSocketAdapter.ts`):

```typescript
interface WebSocketError extends Error {
  code: 'TIMEOUT' | 'CONNECTION_LOST' | 'SERVER_ERROR' | 'PARSE_ERROR';
  retryable: boolean;
  originalError?: Error;
}

private async sendMessage<T>(
  type: string,
  payload: any,
  options?: { timeout?: number; retries?: number }
): Promise<T> {
  const timeout = options?.timeout ?? 30000;
  const maxRetries = options?.retries ?? 2;
  let lastError: WebSocketError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await this._sendMessageOnce<T>(type, payload, timeout);
    } catch (error) {
      lastError = error as WebSocketError;

      if (!lastError.retryable || attempt === maxRetries) {
        throw lastError;
      }

      const backoffMs = 1000 * (attempt + 1); // Exponential: 1s, 2s, 3s
      console.warn(`[WebSocket] Retrying ${type} in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
      await this.delay(backoffMs);
    }
  }

  throw lastError!;
}
```

### Error Categories

**Retryable Errors**:
- `TIMEOUT` - Request exceeded timeout
- `CONNECTION_LOST` - WebSocket disconnected
- `SERVER_ERROR` - Server-side error (5xx)

**Non-Retryable Errors**:
- `PARSE_ERROR` - Invalid response format
- Client errors (4xx)

### Usage

```typescript
// Automatic retry with defaults (2 retries, 30s timeout)
const result = await adapter.sendMessage('git:status', { path });

// Custom retry configuration
const result = await adapter.sendMessage('heavy:operation', payload, {
  timeout: 60000,  // 1 minute
  retries: 5       // 5 retry attempts
});
```

## Server Port Handling

### Purpose

Automatically find available ports instead of failing when default port is busy.

### Implementation

**Server** (`apps/server/src/index.ts`):

```typescript
async function findAvailablePort(startPort = 3002, maxAttempts = 10): Promise<number | null> {
  // Check environment variable first
  if (process.env.PORT) {
    const envPort = parseInt(process.env.PORT, 10);
    if (await isPortAvailable(envPort)) {
      return envPort;
    }
    console.warn(`PORT ${envPort} not available, searching for alternatives...`);
  }

  // Try ports sequentially
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = startPort + attempt;
    if (await isPortAvailable(port)) {
      if (attempt > 0) {
        console.log(`Port ${startPort} not available, using port ${port} instead`);
      }
      return port;
    }
  }

  return null; // All ports busy
}
```

### Error Handling

```typescript
const PORT = await findAvailablePort();
if (PORT === null) {
  console.error(`
========================================
 SERVER STARTUP FAILED: No available ports
========================================
Tried ports: 3002-3011

Possible solutions:
1. Kill processes: lsof -i :3002
2. Set custom port: PORT=4000 pnpm dev:server
3. Check for zombies: ps aux | grep node
========================================
  `);
  process.exit(1);
}
```

## Global Error Handlers

### Desktop App

**Renderer Process** (`apps/desktop/src/renderer/main.tsx`):
```typescript
window.addEventListener('error', (e) => {
  console.error('[Global] Uncaught error:', e.error);
  e.preventDefault(); // Prevent default crash
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Global] Unhandled promise rejection:', e.reason);
  e.preventDefault();
});
```

**Main Process** (`apps/desktop/src/main/index.ts`):
```typescript
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
  // Log but don't crash
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection:', reason);
});
```

### Web App

**Global Handlers** (`apps/web/src/main.tsx`):
```typescript
window.addEventListener('error', (e) => {
  console.error('[Global] Uncaught error:', e.error);
  e.preventDefault();
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Global] Unhandled promise rejection:', e.reason);
  e.preventDefault();
});
```

## Testing Error Handling

### Test ErrorBoundary

```typescript
// Trigger a component error
throw new Error('Test error boundary');
```

**Expected**:
- Fallback UI appears
- Error logged to console
- "Try Again" button shown
- App doesn't crash

### Test Path Validation

```typescript
// Test missing file
const result = validateFilePath('/nonexistent/file.txt');
assert(!result.valid);
assert(result.error.includes('not found'));

// Test valid file
const result2 = validateFilePath(__filename);
assert(result2.valid);
assert(result2.resolvedPath);
```

### Test WebSocket Retry

```bash
# Start server
pnpm dev:server

# In another terminal, start web app
pnpm dev:web

# Kill server mid-operation
pkill -f "apps/server"

# Watch console for retry messages
# Restart server
pnpm dev:server

# App should reconnect automatically
```

### Test Port Handling

```bash
# Block port 3002
nc -l 3002 &

# Start server (should use 3003)
pnpm dev:server

# Check logs for port fallback message
```

## Best Practices

### 1. Always Validate External Input

```typescript
// Bad
const project = await loadProject(userProvidedPath);

// Good
const validation = validateDirectoryPath(userProvidedPath);
if (!validation.valid) {
  throw new Error(`Invalid path: ${validation.error}`);
}
const project = await loadProject(validation.resolvedPath!);
```

### 2. Wrap Components with ErrorBoundary

```typescript
// Bad - error crashes entire app
<App />

// Good - error contained to component
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

### 3. Use Try-Catch for Async Operations

```typescript
// Bad
const data = await fetchData();

// Good
try {
  const data = await fetchData();
  // Use data
} catch (error) {
  console.error('Failed to fetch:', error);
  // Show user-friendly error
}
```

### 4. Provide User Feedback

```typescript
// Bad - silent failure
try {
  await saveSettings(settings);
} catch (error) {
  // Nothing happens
}

// Good - user knows what happened
try {
  await saveSettings(settings);
  showToast('Settings saved');
} catch (error) {
  showToast('Failed to save settings: ' + error.message);
}
```

## Related Documentation

- [Database Architecture](./database-architecture.md)
- [Database Testing](./database-testing.md)
- [Run E2E Tests](./run-e2e-test.md)

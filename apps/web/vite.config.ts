import { defineConfig, loadEnv, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';

/**
 * Resolve a valid TCP port number from an environment string or fall back to a default.
 *
 * Logs a warning and returns the provided default if the value is missing, non-numeric, or outside the range 1–65535.
 *
 * @param envValue - The environment variable value to parse
 * @param defaultPort - Default port to use if validation fails
 * @returns The parsed port when it is between 1 and 65535, otherwise `defaultPort`
 */
function parsePort(envValue: string | undefined, defaultPort: number): number {
  if (!envValue) return defaultPort;
  const parsed = parseInt(envValue, 10);
  if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
    console.warn(`⚠️ Invalid PORT value: ${envValue}, using default ${defaultPort}`);
    return defaultPort;
  }
  return parsed;
}

/**
 * Create a Vite plugin that captures the server's actual listening port.
 *
 * When the dev server starts, writes the resolved port number to a file named `.web-port` so external processes can discover it.
 *
 * @returns The Vite plugin configuration object
 */
function portCapturePlugin() {
  return {
    name: 'port-capture',
    configureServer(server: ViteDevServer) {
      // Hook into the server listening event
      server.httpServer?.on('listening', () => {
        const address = server.httpServer?.address();
        if (address && typeof address === 'object') {
          const actualPort = address.port;
          try {
            fs.writeFileSync('.web-port', actualPort.toString());
            console.log(`✓ Web server started on port ${actualPort}, saved to .web-port`);
          } catch (err) {
            console.warn('⚠️ Failed to write .web-port; continuing without it', err);
          }
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  // Load environment variables using Vite's mode-aware loadEnv
  // This properly handles .env, .env.local, .env.[mode], .env.[mode].local
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      portCapturePlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'VibeTree',
          short_name: 'VibeTree',
          description: 'Vibe code with AI in parallel git worktrees',
          theme_color: '#000000',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    server: {
      port: parsePort(env.PORT, 3000),
      host: env.HOST || '0.0.0.0',
      strictPort: false, // Allow Vite to find alternative ports
      // Note: Proxy configuration removed - apps will connect directly using environment variables
    }
  };
});

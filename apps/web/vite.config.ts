import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

/**
 * Parse and validate a port number from environment variable.
 * @param envValue - The environment variable value to parse
 * @param defaultPort - Default port to use if validation fails
 * @returns A valid port number
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
 * Vite plugin to capture and save the actual port the server uses.
 * Writes the port number to .web-port file for other processes to discover.
 * @returns Vite plugin configuration object
 */
function portCapturePlugin() {
  return {
    name: 'port-capture',
    configureServer(server: any) {
      // Hook into the server listening event
      server.httpServer?.on('listening', () => {
        const address = server.httpServer.address();
        if (address && typeof address === 'object') {
          const actualPort = address.port;
          fs.writeFileSync('.web-port', actualPort.toString());
          console.log(`✓ Web server started on port ${actualPort}, saved to .web-port`);
        }
      });
    }
  };
}

export default defineConfig({
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
    port: parsePort(process.env.PORT, 3000),
    host: process.env.HOST || '0.0.0.0',
    strictPort: false, // Allow Vite to find alternative ports
    // Note: Proxy configuration removed - apps will connect directly using environment variables
  }
});
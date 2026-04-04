/**
 * Service to dynamically discover server port
 */

let cachedServerPort: number | null = null;

/**
 * Discover the server port to use, honoring a cached value and an optional environment override, and probing common ports when needed.
 *
 * If `VITE_SERVER_PORT` is set and parses to an integer in the range 1–65535, that value is cached and returned. Otherwise the function probes ports 3002 through 3051 on the current host by requesting `/health` with a 500ms timeout and caches the first port that responds successfully. If no port responds, the function returns the fallback port 3002.
 *
 * @returns The discovered or cached server port number; falls back to 3002 when discovery fails.
 */
async function discoverServerPort(): Promise<number> {
  if (cachedServerPort) {
    return cachedServerPort;
  }

  // Check environment variable first
  const envPort = import.meta.env.VITE_SERVER_PORT;
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.warn(`⚠️ Invalid VITE_SERVER_PORT value: ${envPort}, falling back to discovery`);
    } else {
      console.log(`📝 Using environment server port: ${port}`);
      cachedServerPort = port;
      return port;
    }
  }

  // Use current hostname for discovery (supports network access)
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;

  // Start with default port 3002 and check sequential ports
  const startPort = 3002;

  for (let i = 0; i < 50; i++) { // Check 50 sequential ports max
    const port = startPort + i;
    try {
      const response = await fetch(`${protocol}//${hostname}:${port}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(500) // 500ms timeout for faster discovery
      });

      if (response.ok) {
        cachedServerPort = port;
        console.log(`✓ Discovered server port: ${port}`);
        return port;
      }
    } catch (error) {
      // Continue trying next port
    }
  }

  // If discovery fails, use default port
  console.warn('⚠️ Could not discover server port, using fallback 3002');
  return 3002;
}

/**
 * Gets the server WebSocket URL, discovering the port if needed
 */
export async function getServerWebSocketUrl(): Promise<string> {
  // Discover the port dynamically
  const port = await discoverServerPort();

  // Use same hostname as current page, with appropriate WebSocket protocol
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.hostname}:${port}`;

  console.log(`🔌 Constructed WebSocket URL: ${wsUrl}`);
  return wsUrl;
}

/**
 * Gets the server HTTP URL, discovering the port if needed
 */
export async function getServerHttpUrl(): Promise<string> {
  // Discover the port dynamically
  const port = await discoverServerPort();

  // Use same hostname and protocol as current page
  const httpUrl = `${window.location.protocol}//${window.location.hostname}:${port}`;

  console.log(`🌐 Constructed HTTP URL: ${httpUrl}`);
  return httpUrl;
}

/**
 * Reset cached server port (useful for testing or when server restarts)
 */
export function resetServerPortCache(): void {
  cachedServerPort = null;
}

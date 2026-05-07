import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverPort = parseInt(env.PORT || '3000', 10);
  const vitePort = parseInt(env.VITE_PORT || '5173', 10);
  const target = `http://localhost:${serverPort}`;
  const wsTarget = target.replace('http://', 'ws://');

  return {
    plugins: [react()],
    define: {
      // The OpenCode SDK uses Node.js globals — polyfill for browser builds
      'process.env': {},
      'process.platform': JSON.stringify('browser'),
      'process.version': JSON.stringify(''),
      'global': 'globalThis',
    },
    optimizeDeps: {
      exclude: ['REFER'],
      entries: ['src/**/*.{ts,tsx}'],
    },
    server: {
      host: '0.0.0.0',
      port: vitePort,
      proxy: {
        // WebSocket terminal — must come before /api catch-all
        '/api/terminal/ws': {
          target: wsTarget,
          ws: true,
          configure: (proxy) => {
            proxy.on('error', () => { /* suppress ECONNRESET noise */ });
          },
        },
        '/api':        target,
        '/health':     target,
        '/config':     target,
        '/switch-dir': target,
        '/restart':    target,
      },
    },
  };
});

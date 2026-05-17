import express from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { PORT, PROJECT_ROOT } from './lib/env.js';
import { startOpenCode } from './lib/opencode-process.js';
import { setupProxy } from './proxy.js';
import { TERMINAL_WS_PATH } from './lib/terminal.js';

import registerAppRoutes from './routes/app.js';
import registerTerminalRoutes from './routes/terminal.js';
import registerFsRoutes from './routes/fs.js';
import registerGitRoutes from './routes/git.js';
import registerMcpRoutes from './routes/mcp.js';
import registerConfigRoutes from './routes/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function start() {
  const app = express();

  // Register routes — order matters: custom routes before proxy
  registerAppRoutes(app);
  registerFsRoutes(app);
  registerGitRoutes(app);
  registerMcpRoutes(app);
  registerConfigRoutes(app);
  const terminalWss = registerTerminalRoutes(app);

  // Proxy remaining /api calls to OpenCode backend
  setupProxy(app);

  // Serve built frontend in production
  const distPath = path.join(PROJECT_ROOT, 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('/{*path}', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/config')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start OpenCode backend
  try {
    await startOpenCode();
    console.log('OpenCode started');
  } catch (error) {
    console.error('Failed to start OpenCode:', error);
    process.exit(1);
  }

  // Create and start HTTP server
  const server = createServer(app);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server at http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} already in use. Kill existing process or change PORT in .env`);
    } else {
      console.error('Server error:', err);
    }
  });

  // Handle WebSocket upgrade for terminal
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === TERMINAL_WS_PATH && terminalWss) {
      terminalWss.handleUpgrade(request, socket, head, (ws) => {
        terminalWss.emit('connection', ws, request);
      });
    }
  });
}

start();

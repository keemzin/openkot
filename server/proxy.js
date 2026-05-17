import { createProxyMiddleware } from 'http-proxy-middleware';
import { OPENCODE_HOST, OPENCODE_PORT } from './lib/env.js';
import { getState } from './lib/opencode-process.js';

export function directoryResolver(req, res, next) {
  const headerDirectory = req.get('x-opencode-directory');
  const queryDirectory = typeof req.query?.directory === 'string' ? req.query.directory : null;
  req.opencodeDirectory = headerDirectory || queryDirectory || getState().currentWorkingDir;
  if (process.env.DEBUG_PROXY) {
    console.log(`[proxy] ${req.method} ${req.path} → dir: ${req.opencodeDirectory}`);
  }
  next();
}

export function setupProxy(app) {
  app.use('/api', directoryResolver);
  const apiProxy = createProxyMiddleware({
    target: `http://${OPENCODE_HOST}:${OPENCODE_PORT}`,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    pathFilter: (path) => !path.startsWith('/api/terminal') && !path.startsWith('/api/notifications') && !path.startsWith('/api/sessions'),
    on: {
      proxyReq: (proxyReq, req) => {
        if (req.opencodeDirectory) {
          proxyReq.setHeader('x-opencode-directory', req.opencodeDirectory);
        }
      },
    },
  });
  app.use('/api', apiProxy);
}

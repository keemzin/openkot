import express from 'express';
import { readConfig, writeConfig } from '../lib/config.js';
import { getState } from '../lib/opencode-process.js';
import { OPENCODE_PORT, OPENCODE_HOST } from '../lib/env.js';

export default function registerMcpRoutes(app) {
  const jsonBody = express.json();

  app.get('/api/config/mcp', (req, res) => {
    const scope = req.query.scope;
    const { currentWorkingDir } = getState();
    const config = readConfig(currentWorkingDir, scope);
    const mcp = config.mcp || {};
    const servers = Object.entries(mcp).map(([name, cfg]) => ({ name, ...cfg }));
    res.json(servers);
  });

  app.get('/api/config/mcp/:name', (req, res) => {
    const { name } = req.params;
    const scope = req.query.scope;
    const { currentWorkingDir } = getState();
    const config = readConfig(currentWorkingDir, scope);
    const server = config.mcp?.[name];
    if (server) {
      res.json({ name, ...server });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  app.post('/api/config/mcp/:name', jsonBody, async (req, res) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope;
      const { currentWorkingDir } = getState();
      const config = readConfig(currentWorkingDir, scope);
      config.mcp = config.mcp || {};
      const { name: _, ...serverConfig } = req.body;
      config.mcp[name] = serverConfig;
      await writeConfig(currentWorkingDir, config, scope);
      fetch(`http://localhost:${OPENCODE_PORT}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcp: config.mcp }),
      }).catch(err => console.error('[MCP reload] Failed to reload MCP:', err));
      res.json({ success: true });
    } catch (error) {
      console.error('[API] POST /api/config/mcp error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/config/mcp/:name', jsonBody, async (req, res) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope;
      const { currentWorkingDir } = getState();
      const config = readConfig(currentWorkingDir, scope);
      if (config.mcp?.[name]) {
        const { name: _, ...updates } = req.body;
        config.mcp[name] = { ...config.mcp[name], ...updates };
        await writeConfig(currentWorkingDir, config, scope);
        fetch(`http://localhost:${OPENCODE_PORT}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mcp: config.mcp }),
        }).catch(err => console.error('[MCP reload] Failed to reload MCP:', err));
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    } catch (error) {
      console.error('[API] PATCH /api/config/mcp error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/config/mcp/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope;
      const { currentWorkingDir } = getState();
      const config = readConfig(currentWorkingDir, scope);
      if (config.mcp?.[name]) {
        delete config.mcp[name];
        await writeConfig(currentWorkingDir, config, scope);
        fetch(`http://localhost:${OPENCODE_PORT}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mcp: config.mcp }),
        }).catch(err => console.error('[MCP reload] Failed to reload MCP:', err));
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    } catch (error) {
      console.error('[API] DELETE /api/config/mcp error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/mcp/status', async (req, res) => {
    try {
      const response = await fetch(`http://${OPENCODE_HOST}:${OPENCODE_PORT}/mcp`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to get MCP status' });
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('[MCP status] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to get MCP status' });
    }
  });

  app.post('/api/mcp/:name/connect', async (req, res) => {
    try {
      const { name } = req.params;
      const response = await fetch(`http://${OPENCODE_HOST}:${OPENCODE_PORT}/mcp/${name}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Connection failed' }));
        return res.status(response.status).json(error);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(`[MCP connect] Error for ${req.params.name}:`, error);
      res.status(500).json({ error: error.message || 'Connection failed' });
    }
  });

  app.post('/api/mcp/:name/disconnect', async (req, res) => {
    try {
      const { name } = req.params;
      const response = await fetch(`http://${OPENCODE_HOST}:${OPENCODE_PORT}/mcp/${name}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Disconnect failed' }));
        return res.status(response.status).json(error);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(`[MCP disconnect] Error for ${req.params.name}:`, error);
      res.status(500).json({ error: error.message || 'Disconnect failed' });
    }
  });
}

import path from 'path';
import fs from 'fs';
import os from 'os';
import express from 'express';
import { getState, restartOpenCode, setWorkingDir } from '../lib/opencode-process.js';
import { WORKING_DIR, OPENCODE_PORT, OPENCODE_HOST } from '../lib/env.js';

export default function registerAppRoutes(app) {
  app.get('/health', (_req, res) => {
    const { isOpenCodeReady, currentRestartPromise, lastOpenCodeError } = getState();
    const planMode = process.env.PLAN_MODE === '1' || process.env.PLAN_MODE === 'true';
    res.json({
      ok: true,
      planModeExperimentalEnabled: planMode,
      isOpenCodeReady,
      isRestarting: currentRestartPromise !== null,
      lastError: lastOpenCodeError ?? null,
    });
  });

  app.get('/config', (_req, res) => {
    const { currentWorkingDir } = getState();
    res.json({ workingDir: currentWorkingDir, rootDir: WORKING_DIR, opencodePort: OPENCODE_PORT, opencodeHost: OPENCODE_HOST });
  });

  app.get('/instances', (_req, res) => {
    try {
      const configPath = path.join(os.homedir(), '.openkot.json');
      if (!fs.existsSync(configPath)) return res.json([]);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const originalInstances = config.instances ?? [];
      const instances = originalInstances.filter(i => {
        if (!i.pid || typeof i.pid !== 'number' || i.pid <= 0) return false;
        try { process.kill(i.pid, 0); return true; } catch { return false; }
      });
      if (instances.length !== originalInstances.length) {
        fs.promises.writeFile(configPath, JSON.stringify({ ...config, instances }, null, 2))
          .catch(e => console.error('Failed to clean instances config:', e));
      }
      res.json(instances);
    } catch (e) {
      console.error('Failed to list instances:', e);
      res.json([]);
    }
  });

  app.post('/switch-dir', express.json(), async (req, res) => {
    const { dir } = req.body;
    if (!dir || typeof dir !== 'string') return res.status(400).json({ error: 'dir required' });
    const resolved = path.resolve(dir);
    try { await fs.promises.access(resolved); } catch { return res.status(400).json({ error: 'Directory not found' }); }
    setWorkingDir(resolved);
    res.json({ workingDir: resolved.replace(/\\/g, '/') });
  });

  app.post('/restart', (_req, res) => {
    res.json({ ok: true, message: 'Restart initiated' });
    const { currentWorkingDir } = getState();
    restartOpenCode(currentWorkingDir).catch(err => {
      console.error('[restart] Failed:', err.message);
    });
  });
}

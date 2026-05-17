import path from 'path';
import fs from 'fs';
import express from 'express';
import { getState } from '../lib/opencode-process.js';
import { WORKING_DIR, OPENCODE_HOST, OPENCODE_PORT } from '../lib/env.js';

export default function registerFsRoutes(app) {
  const jsonBody = express.json();

  app.get('/api/fs/list', async (req, res) => {
    try {
      const rawPath = typeof req.query.path === 'string' ? req.query.path : WORKING_DIR;
      const targetPath = path.resolve(rawPath);
      const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
      const result = entries
        .filter(e => !['node_modules', '.git'].includes(e.name))
        .map(e => ({
          name: e.name,
          path: path.join(targetPath, e.name).replace(/\\/g, '/'),
          isDirectory: e.isDirectory(),
          isFile: e.isFile(),
        }));
      res.json({ directory: targetPath.replace(/\\/g, '/'), entries: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/fs/read', async (req, res) => {
    try {
      const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
      if (!rawPath) return res.status(400).json({ error: 'path required' });
      const targetPath = path.resolve(rawPath);
      const ext = targetPath.split('.').pop()?.toLowerCase();
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];
      if (ext && imageExts.includes(ext)) {
        const content = await fs.promises.readFile(targetPath);
        const mimeTypes = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
          bmp: 'image/bmp', ico: 'image/x-icon',
        };
        res.type(mimeTypes[ext] || 'application/octet-stream').send(content);
      } else {
        const content = await fs.promises.readFile(targetPath, 'utf8');
        res.type('text/plain').send(content);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fs/rename', jsonBody, async (req, res) => {
    try {
      const { oldPath, newPath } = req.body;
      if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath required' });
      await fs.promises.rename(oldPath, newPath);
      res.json({ success: true, path: newPath.replace(/\\/g, '/') });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fs/delete', jsonBody, async (req, res) => {
    try {
      const { path: targetPath } = req.body;
      if (!targetPath) return res.status(400).json({ error: 'path required' });
      const stat = await fs.promises.stat(targetPath);
      if (stat.isDirectory()) {
        await fs.promises.rm(targetPath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(targetPath);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fs/write', jsonBody, async (req, res) => {
    try {
      const { path: rawPath, content = '' } = req.body;
      if (!rawPath) return res.status(400).json({ error: 'path required' });
      const targetPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(WORKING_DIR, rawPath);
      await fs.promises.writeFile(targetPath, content, 'utf8');
      res.json({ success: true, path: targetPath.replace(/\\/g, '/') });
    } catch (err) {
      console.log('[fs/write] error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fs/mkdir', jsonBody, async (req, res) => {
    try {
      const { path: targetPath } = req.body;
      if (!targetPath) return res.status(400).json({ error: 'path required' });
      await fs.promises.mkdir(targetPath, { recursive: true });
      res.json({ success: true, path: targetPath.replace(/\\/g, '/') });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fs/quick-save', jsonBody, async (req, res) => {
    try {
      const { content, filename } = req.body;
      if (!content || !filename) return res.status(400).json({ error: 'content and filename required' });
      const { currentWorkingDir } = getState();
      const quickSaveDir = path.join(currentWorkingDir, 'Quick-save');
      await fs.promises.mkdir(quickSaveDir, { recursive: true });
      const filePath = path.join(quickSaveDir, filename);
      await fs.promises.writeFile(filePath, content, 'utf8');
      res.json({ success: true, path: filePath.replace(/\\/g, '/') });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/fs/search', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    if (!query) return res.json([]);

    const { isOpenCodeReady } = getState();
    if (isOpenCodeReady) {
      try {
        const url = `http://${OPENCODE_HOST}:${OPENCODE_PORT}/find/file?directory=${encodeURIComponent(dir)}&query=${encodeURIComponent(query)}&dirs=false&type=file&limit=50`;
        const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (response.ok) {
          const paths = await response.json();
          const dirNorm = dir.replace(/\\/g, '/');
          const results = paths.map(p => {
            const normPath = (typeof p === 'string' ? p : String(p)).replace(/\\/g, '/');
            const name = normPath.split('/').pop() || normPath;
            const relativePath = normPath.startsWith(dirNorm + '/') ? normPath.slice(dirNorm.length + 1) : normPath;
            return { name, path: normPath, relativePath };
          });
          return res.json(results);
        }
      } catch {}
    }

    const q = query.toLowerCase();
    const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__']);
    const results = [];
    const MAX = 50;
    async function walk(dirPath, depth) {
      if (depth > 8 || results.length >= MAX) return;
      let entries;
      try { entries = await fs.promises.readdir(dirPath, { withFileTypes: true }); }
      catch { return; }
      for (const e of entries) {
        if (results.length >= MAX) break;
        if (IGNORED.has(e.name)) continue;
        const fullPath = path.join(dirPath, e.name).replace(/\\/g, '/');
        if (e.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (e.name.toLowerCase().includes(q)) {
          const rel = fullPath.replace(dir.replace(/\\/g, '/') + '/', '');
          results.push({ name: e.name, path: fullPath, relativePath: rel });
        }
      }
    }
    await walk(dir, 0);
    res.json(results);
  });

  app.get('/api/fs/search-text', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    const pattern = typeof req.query.q === 'string' ? req.query.q : '';
    if (!pattern) return res.json([]);

    const { isOpenCodeReady } = getState();
    if (isOpenCodeReady) {
      try {
        const url = `http://${OPENCODE_HOST}:${OPENCODE_PORT}/find?directory=${encodeURIComponent(dir)}&pattern=${encodeURIComponent(pattern)}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          const matches = await response.json();
          const dirNorm = dir.replace(/\\/g, '/');
          const results = matches.map(m => {
            const normPath = (m.path?.text || '').replace(/\\/g, '/');
            const name = normPath.split('/').pop() || normPath;
            const relativePath = normPath.startsWith(dirNorm + '/') ? normPath.slice(dirNorm.length + 1) : normPath;
            return {
              name, path: normPath, relativePath,
              line_number: m.line_number ?? 0,
              line: m.lines?.text || '',
              match: m.submatches?.[0]?.match?.text || '',
            };
          });
          return res.json(results);
        }
      } catch {}
    }
    res.json([]);
  });

  app.get('/api/fs/search-symbols', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    if (!query) return res.json([]);

    const { isOpenCodeReady } = getState();
    if (isOpenCodeReady) {
      try {
        const url = `http://${OPENCODE_HOST}:${OPENCODE_PORT}/find/symbol?directory=${encodeURIComponent(dir)}&query=${encodeURIComponent(query)}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          const symbols = await response.json();
          const dirNorm = dir.replace(/\\/g, '/');
          const results = symbols.map(s => {
            const uri = s.location?.uri || '';
            const pathPart = uri.replace(/^file:\/\//, '').replace(/\\/g, '/');
            const normPath = process.platform === 'win32' ? pathPart.replace(/^\/([A-Za-z]):/, '$1:') : pathPart;
            return {
              name: s.name || '', path: normPath,
              relativePath: normPath.startsWith(dirNorm + '/') ? normPath.slice(dirNorm.length + 1) : normPath,
              kind: s.kind ?? 0, line_number: (s.location?.range?.start?.line ?? 0) + 1,
            };
          });
          return res.json(results);
        }
      } catch {}
    }
    res.json([]);
  });
}

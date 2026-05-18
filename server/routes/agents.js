import path from 'path';
import fs from 'fs';
import express from 'express';
import os from 'os';
import { getState, restartOpenCode } from '../lib/opencode-process.js';

const AGENTS_META_FILE = 'agents-meta.json';

function getMetaFilePath() {
  const { currentWorkingDir } = getState();
  return path.join(currentWorkingDir, '.opencode', AGENTS_META_FILE);
}

function readMeta() {
  try {
    const filePath = getMetaFilePath();
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

async function writeMeta(data) {
  const filePath = getMetaFilePath();
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getProjectAgentPath(workingDir, name) {
  return path.join(workingDir, '.opencode', 'agents', `${name}.md`);
}

function getUserAgentPath(name) {
  return path.join(os.homedir(), '.config', 'opencode', 'agents', `${name}.md`);
}

function getAgentWritePath(workingDir, name, scope) {
  const userPath = getUserAgentPath(name);
  const projectPath = workingDir ? getProjectAgentPath(workingDir, name) : null;

  if (projectPath && fs.existsSync(projectPath)) {
    return { path: projectPath, scope: 'project' };
  }
  if (fs.existsSync(userPath)) {
    return { path: userPath, scope: 'user' };
  }

  if (scope === 'project' && workingDir) {
    return { path: projectPath, scope: 'project' };
  }
  return { path: userPath, scope: 'user' };
}

function encodeFrontmatter(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v != null)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        if (value.includes('\n') || value.includes(':') || value.includes('#')) {
          return `${key}: ${JSON.stringify(value)}`;
        }
        return `${key}: ${value}`;
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return `${key}: ${value}`;
      }
      if (typeof value === 'object') {
        return `${key}: ${JSON.stringify(value)}`;
      }
      return `${key}: ${value}`;
    })
    .join('\n');
}

function parseFrontmatter(str) {
  const result = {};
  if (!str) return result;
  for (const line of str.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    if (value === 'true') result[key] = true;
    else if (value === 'false') result[key] = false;
    else if (value === 'null') result[key] = null;
    else if (/^-?\d+\.?\d*$/.test(value) && !isNaN(parseFloat(value))) {
      result[key] = value.includes('.') ? parseFloat(value) : parseInt(value, 10);
    } else if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
      try { result[key] = JSON.parse(value); } catch { result[key] = value; }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function parseMdFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content.trim() };
  return { frontmatter: parseFrontmatter(match[1]), body: match[2].trim() };
}

function writeMdFile(filePath, frontmatter, body) {
  const cleaned = Object.fromEntries(
    Object.entries(frontmatter).filter(([, v]) => v != null)
  );
  const yamlStr = encodeFrontmatter(cleaned);
  const content = `---\n${yamlStr}\n---\n\n${body || ''}`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function getConfigCandidates(workingDir) {
  if (!workingDir) return [];
  return [
    path.join(workingDir, 'opencode.json'),
    path.join(workingDir, 'opencode.jsonc'),
    path.join(workingDir, '.opencode', 'opencode.json'),
    path.join(workingDir, '.opencode', 'opencode.jsonc'),
  ];
}

function getConfigPath(workingDir) {
  for (const candidate of getConfigCandidates(workingDir)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(workingDir, '.opencode', 'opencode.jsonc');
}

function readConfigFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function readAgentConfig(workingDir) {
  if (!workingDir) return {};
  return readConfigFile(getConfigPath(workingDir));
}

async function writeConfigFile(filePath, data) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function fireRestartOpenCode() {
  const { currentWorkingDir } = getState();
  restartOpenCode(currentWorkingDir).catch(err => {
    console.error('[agents] Failed to restart OpenCode:', err.message);
  });
}

export default function registerAgentRoutes(app) {
  const jsonBody = express.json();

  app.get('/api/config/agents/meta', (req, res) => {
    const meta = readMeta();
    res.json(meta);
  });

  app.post('/api/config/agents/meta', jsonBody, async (req, res) => {
    try {
      const { name, scope } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const meta = readMeta();
      meta[name] = { scope: scope || 'user' };
      await writeMeta(meta);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/config/agents/meta/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const meta = readMeta();
      if (meta[name]) {
        delete meta[name];
        await writeMeta(meta);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/config/agents/:name', jsonBody, async (req, res) => {
    try {
      const { name } = req.params;
      const { scope, ...config } = req.body;
      const { currentWorkingDir } = getState();

      const userPath = getUserAgentPath(name);
      const projectPath = getProjectAgentPath(currentWorkingDir, name);

      if (fs.existsSync(userPath)) {
        return res.status(409).json({ error: `Agent ${name} already exists` });
      }
      if (fs.existsSync(projectPath)) {
        return res.status(409).json({ error: `Agent ${name} already exists` });
      }

      const writeTarget = scope === 'project' && currentWorkingDir
        ? { path: projectPath, scope: 'project' }
        : { path: userPath, scope: 'user' };

      const { prompt, ...frontmatter } = config;
      writeMdFile(writeTarget.path, frontmatter, prompt || '');

      const meta = readMeta();
      meta[name] = { scope: writeTarget.scope };
      await writeMeta(meta);

      fireRestartOpenCode();

      res.json({
        success: true,
        requiresReload: true,
        message: `Agent ${name} created successfully. Restarting OpenCode…`,
      });
    } catch (error) {
      console.error('[agents] Create failed:', error);
      res.status(500).json({ error: error.message || 'Failed to create agent' });
    }
  });

  app.patch('/api/config/agents/:name', jsonBody, async (req, res) => {
    try {
      const { name } = req.params;
      const updates = req.body;
      const { currentWorkingDir } = getState();

      const writeTarget = getAgentWritePath(currentWorkingDir, name, null);

      if (!fs.existsSync(writeTarget.path)) {
        return res.status(404).json({ error: `Agent ${name} not found` });
      }

      const { frontmatter, body } = parseMdFile(writeTarget.path);

      for (const [key, value] of Object.entries(updates)) {
        if (key === 'prompt' || key === 'scope') continue;
        if (value === null) {
          delete frontmatter[key];
        } else {
          frontmatter[key] = value;
        }
      }

      const newBody = updates.prompt !== undefined ? updates.prompt : body;
      writeMdFile(writeTarget.path, frontmatter, newBody);

      if (updates.scope !== undefined) {
        const meta = readMeta();
        meta[name] = { scope: updates.scope };
        await writeMeta(meta);

        if (writeTarget.scope !== updates.scope) {
          const newTarget = getAgentWritePath(currentWorkingDir, name, updates.scope);
          if (newTarget.path !== writeTarget.path) {
            writeMdFile(newTarget.path, frontmatter, newBody);
            try { fs.unlinkSync(writeTarget.path); } catch {}
          }
        }
      }

      fireRestartOpenCode();

      res.json({
        success: true,
        requiresReload: true,
        message: `Agent ${name} updated successfully. Restarting OpenCode…`,
      });
    } catch (error) {
      console.error('[agents] Update failed:', error);
      res.status(500).json({ error: error.message || 'Failed to update agent' });
    }
  });

  app.delete('/api/config/agents/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const { currentWorkingDir } = getState();

      let deleted = false;

      const projectPath = getProjectAgentPath(currentWorkingDir, name);
      if (fs.existsSync(projectPath)) {
        fs.unlinkSync(projectPath);
        deleted = true;
      }

      const userPath = getUserAgentPath(name);
      if (fs.existsSync(userPath)) {
        fs.unlinkSync(userPath);
        deleted = true;
      }

      if (!deleted) {
        const configPath = getConfigPath(currentWorkingDir);
        const config = readConfigFile(configPath);
        if (config.agent?.[name]) {
          delete config.agent[name];
          if (Object.keys(config.agent).length === 0) delete config.agent;
          await writeConfigFile(configPath, config);
          deleted = true;
        }
      }

      if (!deleted) {
        const configPath = getConfigPath(currentWorkingDir);
        const config = readConfigFile(configPath);
        if (!config.agent) config.agent = {};
        config.agent[name] = { disable: true };
        await writeConfigFile(configPath, config);
      }

      const meta = readMeta();
      if (meta[name]) {
        delete meta[name];
        await writeMeta(meta);
      }

      fireRestartOpenCode();

      res.json({
        success: true,
        requiresReload: true,
        message: `Agent ${name} deleted successfully. Restarting OpenCode…`,
      });
    } catch (error) {
      console.error('[agents] Delete failed:', error);
      res.status(500).json({ error: error.message || 'Failed to delete agent' });
    }
  });
}

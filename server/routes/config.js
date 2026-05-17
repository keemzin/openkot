import path from 'path';
import fs from 'fs';
import express from 'express';
import { readConfig, writeConfig } from '../lib/config.js';
import { getState } from '../lib/opencode-process.js';
import { PROJECT_ROOT } from '../lib/env.js';

export default function registerConfigRoutes(app) {
  const jsonBody = express.json();

  app.get('/api/config/providers', (req, res) => {
    res.json([
      { id: 'openai', name: 'OpenAI', type: 'openai' },
      { id: 'anthropic', name: 'Anthropic', type: 'anthropic' },
      { id: 'ollama', name: 'Ollama', type: 'ollama' },
    ]);
  });

  app.get('/api/config/permissions', (req, res) => {
    try {
      const scope = req.query.scope;
      const { currentWorkingDir } = getState();
      const config = readConfig(currentWorkingDir, scope);
      const permission = config.permission || {};
      const flat = {};
      for (const [key, val] of Object.entries(permission)) {
        if (typeof val === 'string') {
          flat[key] = val;
        } else if (typeof val === 'object' && val !== null) {
          flat[key] = { patterns: val };
        }
      }
      res.json(flat);
    } catch (e) {
      res.json({});
    }
  });

  app.get('/api/config/commands', (req, res) => {
    try {
      const commandsDir = path.join(PROJECT_ROOT, '.opencode', 'commands');
      if (!fs.existsSync(commandsDir)) return res.json([]);
      const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
      const commands = files.map(f => {
        const content = fs.readFileSync(path.join(commandsDir, f), 'utf8');
        const lines = content.split('\n');
        const frontmatter = {};
        let inFrontmatter = false;
        let bodyStart = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim() === '---') {
            if (!inFrontmatter) { inFrontmatter = true; }
            else { bodyStart = i + 1; break; }
          } else if (inFrontmatter) {
            const colon = line.indexOf(':');
            if (colon > 0) {
              const key = line.slice(0, colon).trim();
              const value = line.slice(colon + 1).trim();
              frontmatter[key] = value;
            }
          }
        }
        return {
          file: f,
          name: frontmatter.name || f.replace('.md', ''),
          description: frontmatter.description || '',
          agent: frontmatter.agent || 'build',
          content: lines.slice(bodyStart).join('\n').trim(),
        };
      });
      res.json(commands);
    } catch (e) {
      res.json([]);
    }
  });

  app.post('/api/config/commands/:file', jsonBody, async (req, res) => {
    try {
      const { file } = req.params;
      const { name, description, agent, content } = req.body;
      const commandsDir = path.join(PROJECT_ROOT, '.opencode', 'commands');
      if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir, { recursive: true });
      const filePath = path.join(commandsDir, file);
      const frontmatter = `---
name: ${name}
description: ${description}
agent: ${agent}
---

${content}`;
      fs.writeFileSync(filePath, frontmatter, 'utf8');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/config/commands/:file', async (req, res) => {
    try {
      const { file } = req.params;
      const commandsDir = path.join(PROJECT_ROOT, '.opencode', 'commands');
      const filePath = path.join(commandsDir, file);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/config/providers/custom', (req, res) => {
    try {
      const scope = req.query.scope;
      const { currentWorkingDir } = getState();
      const config = readConfig(currentWorkingDir, scope);
      const provider = config.provider || {};
      const list = Object.entries(provider).map(([id, cfg]) => ({
        name: id,
        displayName: cfg.name || id,
        npm: cfg.npm || '@ai-sdk/openai-compatible',
        baseUrl: cfg.options?.baseURL || '',
        apiKey: cfg.options?.apiKey || '',
        models: Object.keys(cfg.models || {}),
        environment: cfg.environment || {},
      }));
      res.json(list);
    } catch (e) {
      res.json([]);
    }
  });

  app.post('/api/config/providers/custom/:name', jsonBody, async (req, res) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope;
      const { currentWorkingDir } = getState();
      const { displayName, npm, baseUrl, apiKey, models, environment } = req.body;
      const config = readConfig(currentWorkingDir, scope);
      config.provider = config.provider || {};

      const modelsObj = {};
      if (Array.isArray(models)) {
        for (const m of models) {
          modelsObj[m] = { name: m };
        }
      }

      config.provider[name] = {
        name: displayName || name,
        npm: npm || '@ai-sdk/openai-compatible',
        options: { baseURL: baseUrl, ...(apiKey ? { apiKey } : {}) },
        models: modelsObj,
        ...(environment && Object.keys(environment).length > 0 ? { environment } : {}),
      };

      await writeConfig(currentWorkingDir, config, scope);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/config/providers/custom/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope;
      const { currentWorkingDir } = getState();
      const config = readConfig(currentWorkingDir, scope);
      if (config.provider?.[name]) {
        delete config.provider[name];
        if (Object.keys(config.provider).length === 0) delete config.provider;
        await writeConfig(currentWorkingDir, config, scope);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

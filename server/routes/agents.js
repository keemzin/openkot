import path from 'path';
import fs from 'fs';
import express from 'express';
import os from 'os';
import yaml from 'yaml';
import { parse as parseJsonc } from 'jsonc-parser';
import { getState, restartOpenCode } from '../lib/opencode-process.js';

const OPENCODE_CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode');
const AGENT_DIR = path.join(OPENCODE_CONFIG_DIR, 'agents');
const AGENT_SCOPE = { USER: 'user', PROJECT: 'project' };

// ============== DIRS ==============
function ensureDirs() {
  if (!fs.existsSync(AGENT_DIR)) fs.mkdirSync(AGENT_DIR, { recursive: true });
}

// ============== CONFIG LAYERS ==============
function getProjectConfigPath(workingDir) {
  if (!workingDir) return null;
  const candidates = [
    path.join(workingDir, 'opencode.json'),
    path.join(workingDir, 'opencode.jsonc'),
    path.join(workingDir, '.opencode', 'opencode.json'),
    path.join(workingDir, '.opencode', 'opencode.jsonc'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[3];
}

function readConfigFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return parseJsonc(content.trim() || '{}', [], { allowTrailingComma: true });
  } catch {
    return {};
  }
}

function writeConfig(config, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
}

function readConfigLayers(workingDir) {
  const userPaths = [
    path.join(OPENCODE_CONFIG_DIR, 'config.json'),
    path.join(OPENCODE_CONFIG_DIR, 'opencode.json'),
    path.join(OPENCODE_CONFIG_DIR, 'opencode.jsonc'),
  ];
  const userPath = userPaths.find(p => fs.existsSync(p)) || userPaths[0];
  const projectPath = getProjectConfigPath(workingDir);
  const userConfig = readConfigFile(userPath);
  const projectConfig = readConfigFile(projectPath);
  return { userConfig, projectConfig, paths: { userPath, projectPath } };
}

function getJsonEntrySource(layers, agentName) {
  const { projectConfig, userConfig, paths } = layers;
  const projectSection = projectConfig?.agent?.[agentName];
  if (projectSection !== undefined) {
    return { section: projectSection, config: projectConfig, path: paths.projectPath, exists: true };
  }
  const userSection = userConfig?.agent?.[agentName];
  if (userSection !== undefined) {
    return { section: userSection, config: userConfig, path: paths.userPath, exists: true };
  }
  return { section: null, config: null, path: null, exists: false };
}

function getJsonWriteTarget(layers) {
  const { projectConfig, userConfig, paths } = layers;
  if (paths.projectPath) return { config: projectConfig, path: paths.projectPath };
  return { config: userConfig, path: paths.userPath };
}

// ============== MD FILE OPS ==============
function parseMdFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content.trim() };
  let frontmatter = {};
  try { frontmatter = yaml.parse(match[1]) || {}; } catch { frontmatter = {}; }
  return { frontmatter, body: (match[2] || '').trim() };
}

function writeMdFile(filePath, frontmatter, body) {
  const cleaned = Object.fromEntries(Object.entries(frontmatter).filter(([, v]) => v != null));
  const yamlStr = yaml.stringify(cleaned);
  const content = `---\n${yamlStr}---\n\n${body || ''}`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

// ============== AGENT PATH HELPERS ==============
function getProjectAgentPath(workingDir, name) {
  return path.join(workingDir, '.opencode', 'agents', `${name}.md`);
}

function getUserAgentPath(name) {
  return path.join(AGENT_DIR, `${name}.md`);
}

function getAgentScope(name, workingDir) {
  if (workingDir) {
    const projectPath = getProjectAgentPath(workingDir, name);
    if (fs.existsSync(projectPath)) return { scope: AGENT_SCOPE.PROJECT, path: projectPath };
  }
  const userPath = getUserAgentPath(name);
  if (fs.existsSync(userPath)) return { scope: AGENT_SCOPE.USER, path: userPath };
  return { scope: null, path: null };
}

function getAgentWritePath(name, workingDir, requestedScope) {
  const existing = getAgentScope(name, workingDir);
  if (existing.path) return existing;
  const scope = requestedScope || AGENT_SCOPE.USER;
  if (scope === AGENT_SCOPE.PROJECT && workingDir) {
    return { scope: AGENT_SCOPE.PROJECT, path: getProjectAgentPath(workingDir, name) };
  }
  return { scope: AGENT_SCOPE.USER, path: getUserAgentPath(name) };
}

function getAgentSources(name, workingDir) {
  const projectPath = workingDir ? getProjectAgentPath(workingDir, name) : null;
  const projectExists = projectPath && fs.existsSync(projectPath);
  const userPath = getUserAgentPath(name);
  const userExists = fs.existsSync(userPath);

  const mdPath = projectExists ? projectPath : (userExists ? userPath : null);
  const mdScope = projectExists ? AGENT_SCOPE.PROJECT : (userExists ? AGENT_SCOPE.USER : null);

  const layers = readConfigLayers(workingDir);
  const jsonSource = getJsonEntrySource(layers, name);

  const sources = {
    md: { exists: !!mdPath, path: mdPath, scope: mdScope, fields: [] },
    json: { exists: jsonSource.exists, path: jsonSource.path, scope: jsonSource.exists ? (jsonSource.path === layers.paths.projectPath ? AGENT_SCOPE.PROJECT : AGENT_SCOPE.USER) : null, fields: [] },
  };

  if (mdPath) {
    const { frontmatter, body } = parseMdFile(mdPath);
    sources.md.fields = Object.keys(frontmatter);
    if (body) sources.md.fields.push('prompt');
  }
  if (jsonSource.section) {
    sources.json.fields = Object.keys(jsonSource.section);
  }

  return sources;
}

function getAgentConfig(name, workingDir) {
  const existing = getAgentScope(name, workingDir);
  if (existing.path) {
    const { frontmatter, body } = parseMdFile(existing.path);
    return { source: 'md', scope: existing.scope, config: { ...frontmatter, ...(body ? { prompt: body } : {}) } };
  }
  const layers = readConfigLayers(workingDir);
  const jsonSource = getJsonEntrySource(layers, name);
  if (jsonSource.exists && jsonSource.section) {
    const scope = jsonSource.path === layers.paths.projectPath ? AGENT_SCOPE.PROJECT : AGENT_SCOPE.USER;
    return { source: 'json', scope, config: { ...jsonSource.section } };
  }
  return { source: 'none', scope: null, config: {} };
}

// ============== CRUD ==============
function createAgent(name, config, workingDir, scope) {
  ensureDirs();
  const projectPath = workingDir ? getProjectAgentPath(workingDir, name) : null;
  const userPath = getUserAgentPath(name);
  if (projectPath && fs.existsSync(projectPath)) throw new Error(`Agent ${name} already exists as project-level .md`);
  if (fs.existsSync(userPath)) throw new Error(`Agent ${name} already exists as user-level .md`);

  const layers = readConfigLayers(workingDir);
  const jsonSource = getJsonEntrySource(layers, name);
  if (jsonSource.exists) throw new Error(`Agent ${name} already exists in opencode.json`);

  const targetPath = scope === AGENT_SCOPE.PROJECT && workingDir ? projectPath : userPath;
  const { prompt, ...frontmatter } = config;
  writeMdFile(targetPath, frontmatter, prompt || '');
}

function updateAgent(name, updates, workingDir) {
  ensureDirs();

  const { scope, path: mdPath } = getAgentWritePath(name, workingDir, null);
  const mdExists = mdPath && fs.existsSync(mdPath);

  const layers = readConfigLayers(workingDir);
  const jsonSource = getJsonEntrySource(layers, name);
  const hasJsonFields = jsonSource.exists && jsonSource.section && Object.keys(jsonSource.section).length > 0;
  const jsonTarget = jsonSource.exists
    ? { config: jsonSource.config, path: jsonSource.path }
    : getJsonWriteTarget(layers);
  let jsonConfig = jsonTarget.config || {};

  const isBuiltinOverride = !mdExists && !hasJsonFields;

  let targetPath = mdPath;
  let targetScope = scope;

  if (!mdExists && isBuiltinOverride) {
    targetPath = getUserAgentPath(name);
    targetScope = AGENT_SCOPE.USER;
  }

  let mdData = mdExists ? parseMdFile(mdPath) : (isBuiltinOverride ? { frontmatter: {}, body: '' } : null);
  let mdModified = false;
  let jsonModified = false;
  const creatingNewMd = isBuiltinOverride;

  for (const [field, value] of Object.entries(updates)) {
    if (field === 'prompt') {
      const normalizedValue = typeof value === 'string' ? value : (value == null ? '' : String(value));
      if (mdExists || creatingNewMd) {
        if (mdData) { mdData.body = normalizedValue; mdModified = true; }
        continue;
      }
      if (!jsonConfig.agent) jsonConfig.agent = {};
      if (!jsonConfig.agent[name]) jsonConfig.agent[name] = {};
      jsonConfig.agent[name].prompt = normalizedValue;
      jsonModified = true;
      continue;
    }

    const inMd = mdData?.frontmatter?.[field] !== undefined;
    const inJson = jsonSource.section?.[field] !== undefined;

    if (value === null) {
      if (mdData && inMd) { delete mdData.frontmatter[field]; mdModified = true; }
      if (inJson && jsonConfig.agent?.[name]) {
        delete jsonConfig.agent[name][field];
        if (Object.keys(jsonConfig.agent[name]).length === 0) delete jsonConfig.agent[name];
        if (Object.keys(jsonConfig.agent).length === 0) delete jsonConfig.agent;
        jsonModified = true;
      }
      continue;
    }

    if (inJson) {
      if (!jsonConfig.agent) jsonConfig.agent = {};
      if (!jsonConfig.agent[name]) jsonConfig.agent[name] = {};
      jsonConfig.agent[name][field] = value;
      jsonModified = true;
    } else if (inMd || creatingNewMd) {
      if (mdData) { mdData.frontmatter[field] = value; mdModified = true; }
    } else {
      if ((mdExists || creatingNewMd) && mdData) {
        mdData.frontmatter[field] = value;
        mdModified = true;
      } else {
        if (!jsonConfig.agent) jsonConfig.agent = {};
        if (!jsonConfig.agent[name]) jsonConfig.agent[name] = {};
        jsonConfig.agent[name][field] = value;
        jsonModified = true;
      }
    }
  }

  if (mdModified && mdData) {
    writeMdFile(targetPath, mdData.frontmatter, mdData.body);
  }
  if (jsonModified) {
    writeConfig(jsonConfig, jsonTarget.path);
  }
}

function deleteAgent(name, workingDir) {
  ensureDirs();
  let deleted = false;

  if (workingDir) {
    const projectPath = getProjectAgentPath(workingDir, name);
    if (fs.existsSync(projectPath)) { fs.unlinkSync(projectPath); deleted = true; }
  }
  const userPath = getUserAgentPath(name);
  if (fs.existsSync(userPath)) { fs.unlinkSync(userPath); deleted = true; }

  const layers = readConfigLayers(workingDir);
  const jsonSource = getJsonEntrySource(layers, name);
  if (jsonSource.exists && jsonSource.config && jsonSource.path) {
    if (jsonSource.config.agent) delete jsonSource.config.agent[name];
    writeConfig(jsonSource.config, jsonSource.path);
    deleted = true;
  }

  if (!deleted) {
    const jsonTarget = getJsonWriteTarget(layers);
    if (!jsonTarget.config.agent) jsonTarget.config.agent = {};
    jsonTarget.config.agent[name] = { disable: true };
    writeConfig(jsonTarget.config, jsonTarget.path);
  }
}

function fireRestartOpenCode() {
  const { currentWorkingDir } = getState();
  restartOpenCode(currentWorkingDir).catch(err => {
    console.error('[agents] Failed to restart OpenCode:', err.message);
  });
}

function resolveDirectory(req) {
  const dir = req.query.directory || req.headers['x-opencode-directory'];
  if (dir) return dir;
  const { currentWorkingDir } = getState();
  return currentWorkingDir;
}

export default function registerAgentRoutes(app) {
  const jsonBody = express.json();

  app.get('/api/config/agents/:name', (req, res) => {
    try {
      const agentName = req.params.name;
      const workingDir = resolveDirectory(req);
      const sources = getAgentSources(agentName, workingDir);
      const scope = sources.md.exists ? sources.md.scope : (sources.json.exists ? sources.json.scope : null);
      res.json({ name: agentName, sources, scope, isBuiltIn: !sources.md.exists && !sources.json.exists });
    } catch (error) {
      console.error('[agents] GET sources failed:', error);
      res.status(500).json({ error: 'Failed to get agent configuration metadata' });
    }
  });

  app.get('/api/config/agents/:name/config', (req, res) => {
    try {
      const agentName = req.params.name;
      const workingDir = resolveDirectory(req);
      const configInfo = getAgentConfig(agentName, workingDir);
      res.json(configInfo);
    } catch (error) {
      console.error('[agents] GET config failed:', error);
      res.status(500).json({ error: 'Failed to get agent configuration' });
    }
  });

  app.post('/api/config/agents/:name', jsonBody, async (req, res) => {
    try {
      const agentName = req.params.name;
      const { scope, ...config } = req.body;
      const workingDir = resolveDirectory(req);

      createAgent(agentName, config, workingDir, scope);
      fireRestartOpenCode();

      res.json({ success: true, requiresReload: true, message: `Agent ${agentName} created successfully.` });
    } catch (error) {
      console.error('[agents] Create failed:', error);
      res.status(500).json({ error: error.message || 'Failed to create agent' });
    }
  });

  app.patch('/api/config/agents/:name', jsonBody, async (req, res) => {
    try {
      const agentName = req.params.name;
      const updates = req.body;
      const workingDir = resolveDirectory(req);

      updateAgent(agentName, updates, workingDir);
      fireRestartOpenCode();

      res.json({ success: true, requiresReload: true, message: `Agent ${agentName} updated successfully.` });
    } catch (error) {
      console.error('[agents] Update failed:', error);
      res.status(500).json({ error: error.message || 'Failed to update agent' });
    }
  });

  app.delete('/api/config/agents/:name', async (req, res) => {
    try {
      const agentName = req.params.name;
      const workingDir = resolveDirectory(req);

      deleteAgent(agentName, workingDir);
      fireRestartOpenCode();

      res.json({ success: true, requiresReload: true, message: `Agent ${agentName} deleted successfully.` });
    } catch (error) {
      console.error('[agents] Delete failed:', error);
      res.status(500).json({ error: error.message || 'Failed to delete agent' });
    }
  });
}

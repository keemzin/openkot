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

function ensureDirs() {
  if (!fs.existsSync(AGENT_DIR)) fs.mkdirSync(AGENT_DIR, { recursive: true });
}

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
    return parseJsonc(fs.readFileSync(filePath, 'utf8').trim() || '{}', [], { allowTrailingComma: true });
  } catch {
    return {};
  }
}

async function writeConfigAsync(config, filePath) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8');
}

function readConfigLayers(workingDir) {
  const userPaths = [
    path.join(OPENCODE_CONFIG_DIR, 'config.json'),
    path.join(OPENCODE_CONFIG_DIR, 'opencode.json'),
    path.join(OPENCODE_CONFIG_DIR, 'opencode.jsonc'),
  ];
  const userPath = userPaths.find(p => fs.existsSync(p)) || userPaths[0];
  const projectPath = getProjectConfigPath(workingDir);
  return { userConfig: readConfigFile(userPath), projectConfig: readConfigFile(projectPath), paths: { userPath, projectPath } };
}

function getJsonEntrySource(layers, agentName) {
  const { projectConfig, userConfig, paths } = layers;
  const projectSection = projectConfig?.agent?.[agentName];
  if (projectSection !== undefined) return { section: projectSection, config: projectConfig, path: paths.projectPath, exists: true };
  const userSection = userConfig?.agent?.[agentName];
  if (userSection !== undefined) return { section: userSection, config: userConfig, path: paths.userPath, exists: true };
  return { section: null, config: null, path: null, exists: false };
}

function getJsonWriteTarget(layers) {
  if (layers.paths.projectPath) return { config: layers.projectConfig, path: layers.paths.projectPath };
  return { config: layers.userConfig, path: layers.paths.userPath };
}

function parseMdFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content.trim() };
  let frontmatter = {};
  try { frontmatter = yaml.parse(match[1]) || {}; } catch { frontmatter = {}; }
  return { frontmatter, body: (match[2] || '').trim() };
}

async function writeMdFileAsync(filePath, frontmatter, body) {
  const cleaned = Object.fromEntries(Object.entries(frontmatter).filter(([, v]) => v != null));
  const yamlStr = yaml.stringify(cleaned);
  const content = `---\n${yamlStr}---\n\n${body || ''}`;
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, 'utf8');
}

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

async function createAgent(name, config, workingDir, scope) {
  ensureDirs();
  const projectPath = workingDir ? getProjectAgentPath(workingDir, name) : null;
  const userPath = getUserAgentPath(name);
  if (projectPath && fs.existsSync(projectPath)) throw new Error(`Agent ${name} already exists as project-level .md`);
  if (fs.existsSync(userPath)) throw new Error(`Agent ${name} already exists as user-level .md`);
  const layers = readConfigLayers(workingDir);
  if (getJsonEntrySource(layers, name).exists) throw new Error(`Agent ${name} already exists in opencode.json`);

  const targetPath = scope === AGENT_SCOPE.PROJECT && workingDir ? projectPath : userPath;
  const { prompt, ...frontmatter } = config;
  await writeMdFileAsync(targetPath, frontmatter, prompt || '');
}

async function updateAgent(name, updates, workingDir) {
  ensureDirs();

  const { scope, path: mdPath } = getAgentWritePath(name, workingDir, null);
  const mdExists = mdPath && fs.existsSync(mdPath);
  const layers = readConfigLayers(workingDir);
  const jsonSource = getJsonEntrySource(layers, name);
  const hasJsonFields = jsonSource.exists && jsonSource.section && Object.keys(jsonSource.section).length > 0;
  const jsonTarget = jsonSource.exists
    ? { config: jsonSource.config, path: jsonSource.path }
    : getJsonWriteTarget(layers);
  const jsonConfig = jsonTarget.config || {};
  const isBuiltinOverride = !mdExists && !hasJsonFields;

  let targetPath = mdPath;
  if (!mdExists && isBuiltinOverride) targetPath = getUserAgentPath(name);

  const mdData = mdExists ? parseMdFile(mdPath) : (isBuiltinOverride ? { frontmatter: {}, body: '' } : null);
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
    } else if ((mdExists || creatingNewMd) && mdData) {
      mdData.frontmatter[field] = value;
      mdModified = true;
    } else {
      if (!jsonConfig.agent) jsonConfig.agent = {};
      if (!jsonConfig.agent[name]) jsonConfig.agent[name] = {};
      jsonConfig.agent[name][field] = value;
      jsonModified = true;
    }
  }

  if (mdModified && mdData) {
    await writeMdFileAsync(targetPath, mdData.frontmatter, mdData.body);
  }
  if (jsonModified) {
    await writeConfigAsync(jsonConfig, jsonTarget.path);
  }
}

async function deleteAgent(name, workingDir) {
  ensureDirs();
  let deleted = false;

  if (workingDir) {
    const projectPath = getProjectAgentPath(workingDir, name);
    if (fs.existsSync(projectPath)) { await fs.promises.unlink(projectPath); deleted = true; }
  }
  const userPath = getUserAgentPath(name);
  if (fs.existsSync(userPath)) { await fs.promises.unlink(userPath); deleted = true; }

  const layers = readConfigLayers(workingDir);
  const jsonSource = getJsonEntrySource(layers, name);
  if (jsonSource.exists && jsonSource.config && jsonSource.path) {
    if (jsonSource.config.agent) delete jsonSource.config.agent[name];
    await writeConfigAsync(jsonSource.config, jsonSource.path);
    deleted = true;
  }

  if (!deleted) {
    const jsonTarget = getJsonWriteTarget(layers);
    if (!jsonTarget.config.agent) jsonTarget.config.agent = {};
    jsonTarget.config.agent[name] = { disable: true };
    await writeConfigAsync(jsonTarget.config, jsonTarget.path);
  }
}

async function restartOpenCodeAndWait(reason) {
  const { currentWorkingDir } = getState();
  console.log(`[agents] Restarting OpenCode after ${reason}...`);
  try {
    await restartOpenCode(currentWorkingDir);
    console.log(`[agents] OpenCode ready after ${reason}`);
  } catch (error) {
    console.error(`[agents] OpenCode restart failed after ${reason}:`, error.message);
    throw error;
  }
}

function resolveDirectory(req) {
  const dir = req.query.directory || req.headers['x-opencode-directory'];
  if (dir) return dir;
  return getState().currentWorkingDir;
}

export default function registerAgentRoutes(app) {
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
      res.json(getAgentConfig(agentName, workingDir));
    } catch (error) {
      console.error('[agents] GET config failed:', error);
      res.status(500).json({ error: 'Failed to get agent configuration' });
    }
  });

  app.post('/api/config/agents/:name', express.json(), async (req, res) => {
    try {
      const agentName = req.params.name;
      const { scope, ...config } = req.body;
      const workingDir = resolveDirectory(req);
      await createAgent(agentName, config, workingDir, scope);
      await restartOpenCodeAndWait('agent creation');
      res.json({ success: true, requiresReload: true, message: `Agent ${agentName} created.` });
    } catch (error) {
      console.error('[agents] Create failed:', error);
      res.status(500).json({ error: error.message || 'Failed to create agent' });
    }
  });

  app.patch('/api/config/agents/:name', express.json(), async (req, res) => {
    try {
      const agentName = req.params.name;
      const updates = req.body;
      const workingDir = resolveDirectory(req);
      await updateAgent(agentName, updates, workingDir);
      await restartOpenCodeAndWait('agent update');
      res.json({ success: true, requiresReload: true, message: `Agent ${agentName} updated.` });
    } catch (error) {
      console.error('[agents] Update failed:', error);
      res.status(500).json({ error: error.message || 'Failed to update agent' });
    }
  });

  app.delete('/api/config/agents/:name', async (req, res) => {
    try {
      const agentName = req.params.name;
      const workingDir = resolveDirectory(req);
      await deleteAgent(agentName, workingDir);
      await restartOpenCodeAndWait('agent deletion');
      res.json({ success: true, requiresReload: true, message: `Agent ${agentName} deleted.` });
    } catch (error) {
      console.error('[agents] Delete failed:', error);
      res.status(500).json({ error: error.message || 'Failed to delete agent' });
    }
  });
}

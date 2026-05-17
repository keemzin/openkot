import path from 'path';
import fs from 'fs';
import os from 'os';

export const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.opencode', 'opencode.jsonc');

export function getConfigPath(currentWorkingDir, scope) {
  if (scope === 'global') return GLOBAL_CONFIG_PATH;
  if (scope === 'local') return path.join(currentWorkingDir, '.opencode', 'opencode.jsonc');
  const projectPath = path.join(currentWorkingDir, '.opencode', 'opencode.jsonc');
  return fs.existsSync(projectPath) ? projectPath : GLOBAL_CONFIG_PATH;
}

export function parseJsonc(content) {
  return JSON.parse(content);
}

export function readConfig(currentWorkingDir, scope) {
  const configPath = getConfigPath(currentWorkingDir, scope);
  try {
    if (!fs.existsSync(configPath)) return {};
    const content = fs.readFileSync(configPath, 'utf8');
    return parseJsonc(content);
  } catch (e) {
    return {};
  }
}

export async function writeConfig(currentWorkingDir, data, scope) {
  const configPath = getConfigPath(currentWorkingDir, scope);
  try {
    await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
    const json = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(configPath, json, 'utf8');
  } catch (error) {
    console.error('Failed to write config:', error);
    throw error;
  }
}

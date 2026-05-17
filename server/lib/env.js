import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Load .env
const envPath = path.join(PROJECT_ROOT, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

export const PORT          = parseInt(process.env.PORT          || '3000', 10);
export const OPENCODE_PORT = parseInt(process.env.OPENCODE_PORT || '3358', 10);
export const OPENCODE_HOST = process.env.OPENCODE_HOST || '127.0.0.1';

export const VENDOR_OPENCODE = (() => {
  if (process.env.OPENCODE_BINARY) return path.resolve(process.env.OPENCODE_BINARY);
  const platformMap = { darwin: 'darwin', linux: 'linux', win32: 'windows' };
  const platform = platformMap[process.platform] || process.platform;
  const binaryName = platform === 'windows' ? 'opencode.exe' : 'opencode';
  for (const pkg of [`opencode-${platform}-${process.arch}`, `opencode-${platform}-${process.arch}-baseline`]) {
    try { return fileURLToPath(import.meta.resolve(`${pkg}/bin/${binaryName}`)); } catch {}
  }
  try { return path.join(path.dirname(fileURLToPath(import.meta.resolve('opencode-ai/package.json'))), 'bin', 'opencode'); } catch {}
  return 'opencode';
})();

export const WORKING_DIR = process.env.WORKING_DIR
  ? (path.isAbsolute(process.env.WORKING_DIR)
      ? process.env.WORKING_DIR
      : path.join(PROJECT_ROOT, process.env.WORKING_DIR))
  : path.join(PROJECT_ROOT, 'WORKSPACE');

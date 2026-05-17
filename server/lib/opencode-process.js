import { createConnection } from 'net';
import { spawn } from 'child_process';
import { OPENCODE_HOST, OPENCODE_PORT, VENDOR_OPENCODE, WORKING_DIR } from './env.js';

let opencodeProcess = null;
let currentWorkingDir = WORKING_DIR;
let isOpenCodeReady = false;
let currentRestartPromise = null;
let lastOpenCodeError = null;

export function getState() {
  return { opencodeProcess, currentWorkingDir, isOpenCodeReady, currentRestartPromise, lastOpenCodeError };
}

export function setWorkingDir(dir) {
  currentWorkingDir = dir;
}

const hasProcessExited = (proc) => !proc || proc.exitCode !== null || proc.signalCode !== null;

const waitForProcessClose = (proc, timeoutMs) => new Promise((resolve) => {
  if (!proc || hasProcessExited(proc)) { resolve(true); return; }
  let done = false;
  const finish = (closed) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    proc.off('close', onClose);
    proc.off('error', onError);
    resolve(closed);
  };
  const onClose = () => finish(true);
  const onError = () => finish(hasProcessExited(proc));
  const timer = setTimeout(() => finish(hasProcessExited(proc)), timeoutMs);
  proc.once('close', onClose);
  proc.once('error', onError);
});

async function killOpenCode() {
  console.log('[OpenCode] Stopping previous instance...');
  isOpenCodeReady = false;

  const proc = opencodeProcess?._child ?? null;
  const pid  = opencodeProcess?.pid ?? null;
  opencodeProcess = null;

  if (!pid) return;

  try { if (proc) proc.kill(); } catch {}

  if (proc && await waitForProcessClose(proc, 3000)) {
    console.log('[OpenCode] Process exited cleanly.');
    return;
  }

  if (process.platform === 'win32') {
    for (const flags of [['/pid', String(pid), '/t'], ['/pid', String(pid), '/f', '/t']]) {
      try {
        const { spawnSync } = await import('child_process');
        spawnSync('taskkill', flags, { stdio: 'ignore', timeout: 5000, windowsHide: true });
      } catch {}
      if (!proc || hasProcessExited(proc)) break;
      if (proc) await waitForProcessClose(proc, 2000);
    }
  } else {
    try { if (proc) proc.kill('SIGKILL'); } catch {}
    await waitForProcessClose(proc, 2000);
  }
}

async function waitForPortFree(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  const probeHost = (!OPENCODE_HOST || OPENCODE_HOST === '0.0.0.0' || OPENCODE_HOST === '::' || OPENCODE_HOST === '[::]')
    ? '127.0.0.1'
    : OPENCODE_HOST;

  while (Date.now() < deadline) {
    const inUse = await new Promise((resolve) => {
      const sock = createConnection({ port, host: probeHost });
      const t = setTimeout(() => { sock.destroy(); resolve(false); }, 400);
      sock.once('connect', () => { clearTimeout(t); sock.destroy(); resolve(true); });
      sock.once('error', () => { clearTimeout(t); resolve(false); });
    });
    if (!inUse) { console.log(`[OpenCode] Port ${port} is free.`); return; }
    console.log(`[OpenCode] Waiting for port ${port} to be released...`);
    await new Promise(r => setTimeout(r, 200));
  }
  console.warn(`[OpenCode] Timed out waiting for port ${port} to free — proceeding anyway.`);
}

async function waitForOpenCodeReady(timeoutMs = 20000) {
  const base = `http://${OPENCODE_HOST}:${OPENCODE_PORT}`;
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/session`, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 401 || res.status === 404) {
        isOpenCodeReady = true;
        lastOpenCodeError = null;
        console.log('[OpenCode] API is ready.');
        return;
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 400));
  }

  const msg = `Timed out waiting for OpenCode API to respond. Last error: ${lastErr?.message ?? 'unknown'}`;
  lastOpenCodeError = msg;
  throw new Error(msg);
}

async function spawnOpenCode(dir) {
  console.log(`[OpenCode] Spawning in ${dir}...`);
  console.log(`[OpenCode] Binary: ${VENDOR_OPENCODE}`);

  const proc = Bun.spawn({
    cmd: [VENDOR_OPENCODE, 'serve', '--port', String(OPENCODE_PORT), '--hostname', OPENCODE_HOST, '--cors'],
    cwd: dir,
    env: { ...process.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  console.log('[OpenCode] Started with PID:', proc.pid);

  const bunProc = proc;
  const fakeChild = {
    pid: proc.pid,
    exitCode: null,
    signalCode: null,
    kill: (sig) => proc.kill(sig),
    off: () => {},
    once: (event, cb) => {
      if (event === 'close' || event === 'exit') {
        bunProc.exited.then(() => { fakeChild.exitCode = bunProc.exitCode ?? 0; cb(); }).catch(() => cb());
      }
    },
  };

  opencodeProcess = { kill: (sig) => proc.kill(sig), pid: proc.pid, _child: fakeChild };

  await new Promise((resolve, reject) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    const dec = new TextDecoder();
    let done = false;

    const finish = (fn, val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(val);
    };

    const checkReady = (text) => {
      if (text.includes('opencode server listening') || text.includes('kilo server listening') || text.includes('listening')) {
        finish(resolve, text);
        return true;
      }
      return false;
    };

    const timer = setTimeout(() => {
      proc.kill();
      finish(reject, new Error(`Timeout waiting for OpenCode to start.\nstdout: ${stdoutBuf}\nstderr: ${stderrBuf}`));
    }, 30000);

    (async () => {
      for await (const chunk of proc.stdout) {
        stdoutBuf += dec.decode(chunk);
        if (checkReady(stdoutBuf)) return;
      }
    })().catch(() => {});

    (async () => {
      for await (const chunk of proc.stderr) {
        stderrBuf += dec.decode(chunk);
        if (checkReady(stderrBuf)) return;
      }
    })().catch(() => {});

    proc.exited.then((code) => {
      finish(reject, new Error(`OpenCode exited with code ${code}.\nstdout: ${stdoutBuf}\nstderr: ${stderrBuf}`));
    }).catch((e) => finish(reject, e));
  });

  console.log('[OpenCode] Process signalled ready, verifying API...');
}

const START_OPENCODE_MAX_ATTEMPTS = 3;

async function startOpenCode(cwd) {
  const dir = cwd || currentWorkingDir;
  let lastError = null;

  for (let attempt = 1; attempt <= START_OPENCODE_MAX_ATTEMPTS; attempt++) {
    try {
      await killOpenCode();
      await spawnOpenCode(dir);
      await waitForOpenCodeReady(20000);
      currentWorkingDir = dir;
      console.log('[OpenCode] Fully ready!');
      return;
    } catch (e) {
      lastError = e;
      console.warn(`[OpenCode] Start attempt ${attempt}/${START_OPENCODE_MAX_ATTEMPTS} failed: ${e.message}`);
      if (attempt >= START_OPENCODE_MAX_ATTEMPTS) break;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  console.error('[OpenCode] All start attempts failed');
  isOpenCodeReady = false;
  lastOpenCodeError = lastError?.message || 'Failed to start OpenCode';
  throw lastError;
}

async function restartOpenCode(cwd) {
  if (currentRestartPromise) {
    console.log('[OpenCode] Restart already in progress, waiting...');
    return currentRestartPromise;
  }

  currentRestartPromise = (async () => {
    isOpenCodeReady = false;
    try {
      await startOpenCode(cwd || currentWorkingDir);
    } finally {
      currentRestartPromise = null;
    }
  })();

  return currentRestartPromise;
}

export async function forceRestartOpenCode(cwd) {
  currentRestartPromise = null;
  return restartOpenCode(cwd);
}

export { startOpenCode, restartOpenCode, killOpenCode };

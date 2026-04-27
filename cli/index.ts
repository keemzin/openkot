#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "net";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_PATH = join(homedir(), ".openkot.json");
const DEFAULT_PORT = 3006;
const DEFAULT_OPENCODE_PORT = 3358;

// Project root is one level up from cli/
const PROJECT_ROOT = resolve(join(__dirname, ".."));
const SERVER_ENTRY = join(PROJECT_ROOT, "server", "index.js");
const DIST_DIR = join(PROJECT_ROOT, "dist");

interface Instance {
  id: string;
  name: string;
  directory: string;
  port: number;
  opencodePort: number;
  pid: number;
  startedAt: string;
}

interface Config {
  instances: Instance[];
}

function readConfig(): Config {
  try {
    if (existsSync(CONFIG_PATH)) return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {}
  return { instances: [] };
}

function writeConfig(config: Config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function isRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function killPid(pid: number) {
  try {
    if (process.platform === "win32") {
      Bun.spawn(["taskkill", "/F", "/T", "/PID", String(pid)], { stdio: ["ignore", "ignore", "ignore"] });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch {}
}

function openBrowser(port: number) {
  const url = `http://localhost:${port}`;
  if (process.platform === "darwin") Bun.spawn(["open", url]);
  else if (process.platform === "win32") Bun.spawn(["cmd", "/c", "start", url]);
  else Bun.spawn(["xdg-open", url]);
}

async function findFreePort(start: number): Promise<number> {
  const config = readConfig();
  const usedPorts = new Set(config.instances.map(i => i.port).concat(config.instances.map(i => i.opencodePort)));
  let port = start;
  // Also check if port is actually in use on the system
  while (usedPorts.has(port) || await isPortInUse(port)) port++;
  return port;
}

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => { server.close(); resolve(false); });
    server.listen(port, '127.0.0.1');
  });
}

async function cmdStart(directory: string, opts: { port?: number; opencodePort?: number; name?: string }) {
  const resolvedDir = resolve(directory);

  if (!existsSync(resolvedDir)) {
    console.error(`❌ Directory not found: ${resolvedDir}`);
    process.exit(1);
  }

  // Check dist exists (need to build first)
  if (!existsSync(DIST_DIR)) {
    console.log("⚠️  No dist/ found. Building frontend...");
    const build = Bun.spawnSync(["bun", "run", "build"], { cwd: PROJECT_ROOT, stdio: ["ignore", "inherit", "inherit"] });
    if (build.exitCode !== 0) {
      console.error("❌ Build failed. Run `bun run build` manually first.");
      process.exit(1);
    }
  }

  const config = readConfig();

  // Check if already running for this directory
  const existing = config.instances.find(i => i.directory === resolvedDir && isRunning(i.pid));
  if (existing) {
    console.log(`✅ Already running for: ${resolvedDir}`);
    console.log(`   View: http://localhost:${existing.port}`);
    openBrowser(existing.port);
    return;
  }

  // Remove stale entry
  config.instances = config.instances.filter(i => i.directory !== resolvedDir || isRunning(i.pid));

  const port = opts.port ?? await findFreePort(DEFAULT_PORT);
  const opencodePort = opts.opencodePort ?? await findFreePort(DEFAULT_OPENCODE_PORT);
  const name = opts.name ?? resolvedDir.replace(/\\/g, "/").split("/").pop() ?? "openkot";

  console.log(`\nStarting OpenKot...`);
  console.log(`  Directory:    ${resolvedDir}`);
  console.log(`  Web UI port:  ${port}`);
  console.log(`  OpenCode port: ${opencodePort}`);

  // Start the Express server (it manages opencode internally)
  const proc = Bun.spawn(["bun", SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      OPENCODE_PORT: String(opencodePort),
      OPENCODE_HOST: "127.0.0.1",
      WORKING_DIR: resolvedDir,  // absolute path
      NODE_ENV: "production",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  // Wait for server to be ready by polling the health endpoint
  let ready = false;
  const timeout = setTimeout(() => {
    if (!ready) {
      console.error("❌ Server did not start in time.");
      proc.kill();
      process.exit(1);
    }
  }, 30000);

  // Poll health endpoint instead of reading stdout (since we use inherit)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) { ready = true; break; }
    } catch {}
  }
  clearTimeout(timeout);

  const instance: Instance = {
    id: Math.random().toString(36).slice(2, 10),
    name,
    directory: resolvedDir,
    port,
    opencodePort,
    pid: proc.pid,
    startedAt: new Date().toISOString(),
  };

  config.instances.push(instance);
  writeConfig(config);

  console.log(`\n✅ OpenKot started!`);
  console.log(`   View:     http://localhost:${port}`);
  console.log(`   OpenCode: http://localhost:${opencodePort}`);
  console.log(`\nPress Ctrl+C to stop, or run: openkot stop`);

  openBrowser(port);

  // Handle exit
  process.on("SIGINT", () => { killPid(proc.pid); config.instances = config.instances.filter(i => i.pid !== proc.pid); writeConfig(config); process.exit(0); });
  process.on("SIGTERM", () => { killPid(proc.pid); process.exit(0); });

  await proc.exited;
  config.instances = config.instances.filter(i => i.pid !== proc.pid);
  writeConfig(config);
}

function cmdStop(opts: { directory?: string; port?: number; all?: boolean }) {
  const config = readConfig();

  if (opts.all || (!opts.directory && !opts.port)) {
    let stopped = 0;
    for (const i of config.instances) { if (isRunning(i.pid)) { killPid(i.pid); stopped++; } }
    config.instances = [];
    writeConfig(config);
    console.log(`Stopped ${stopped} instance(s).`);
    return;
  }

  const instance = opts.port
    ? config.instances.find(i => i.port === opts.port)
    : config.instances.find(i => i.directory === resolve(opts.directory!));

  if (!instance) { console.log("No matching instance found."); return; }
  killPid(instance.pid);
  config.instances = config.instances.filter(i => i.id !== instance.id);
  writeConfig(config);
  console.log(`Stopped: ${instance.name} (port ${instance.port})`);
}

function cmdList() {
  const config = readConfig();
  const active = config.instances.filter(i => isRunning(i.pid));

  if (active.length === 0) { console.log("No running instances."); return; }

  console.log("\nRunning OpenKot instances:\n");
  for (const i of active) {
    console.log(`  ${i.name}`);
    console.log(`    View:      http://localhost:${i.port}`);
    console.log(`    OpenCode:  http://localhost:${i.opencodePort}`);
    console.log(`    Directory: ${i.directory}`);
    console.log(`    PID:       ${i.pid}`);
    console.log();
  }
}

function cmdClean() {
  const config = readConfig();
  const before = config.instances.length;
  config.instances = config.instances.filter(i => isRunning(i.pid));
  writeConfig(config);
  console.log(`Cleaned ${before - config.instances.length} stale entries. ${config.instances.length} active.`);
}

function printHelp() {
  console.log(`
OpenKot CLI

Usage:
  openkot [directory]          Start in directory (default: current dir)
  openkot .                    Start in current directory
  openkot stop                 Stop all instances
  openkot stop [dir]           Stop instance for directory
  openkot list                 List running instances
  openkot clean                Remove stale entries

Options:
  --port <port>                Web UI port (default: ${DEFAULT_PORT})
  --opencode-port <port>       OpenCode port (default: ${DEFAULT_OPENCODE_PORT})
  --name <name>                Instance name

Examples:
  openkot                      Start in current directory
  openkot ./my-project         Start in specific directory
  openkot --port 8080          Use custom port
  openkot stop                 Stop all
`);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rawArgs[i + 1];
      if (next && !next.startsWith("-")) { flags[key] = next; i++; }
      else flags[key] = true;
    } else if (a.startsWith("-")) {
      const key = a.slice(1);
      const next = rawArgs[i + 1];
      if (next && !next.startsWith("-")) { flags[key] = next; i++; }
      else flags[key] = true;
    } else {
      positional.push(a);
    }
  }

  if (flags.help || flags.h) { printHelp(); return; }

  const cmd = positional[0]?.toLowerCase();

  switch (cmd) {
    case "stop":
      cmdStop({ directory: positional[1], port: flags.port ? parseInt(flags.port as string) : undefined, all: !positional[1] && !flags.port });
      break;
    case "list": case "ls":
      cmdList();
      break;
    case "clean":
      cmdClean();
      break;
    case "help":
      printHelp();
      break;
    default: {
      // Treat as directory or start
      const dir = (cmd && cmd !== "start") ? cmd : (positional[1] ?? process.cwd());
      await cmdStart(dir, {
        port: flags.port ? parseInt(flags.port as string) : undefined,
        opencodePort: flags["opencode-port"] ? parseInt(flags["opencode-port"] as string) : undefined,
        name: flags.name as string | undefined,
      });
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });

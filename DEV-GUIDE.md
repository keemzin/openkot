# OpenKot Development Guide

## Quick Start

### Start Development Servers
```bash
bun run dev
```
This starts:
- **Vite** on port `5173` (configurable via `VITE_PORT` in `.env`)
- **Express** on port `3006` (configurable via `PORT` in `.env`)
- **OpenCode** on port `3358` (configurable via `OPENCODE_PORT` in `.env`)

### Stop Development Servers

**Option 1: Ctrl+C in terminal** (recommended)
- Press `Ctrl+C` in the terminal where `bun run dev` is running

**Option 2: Use stop script**
```bash
# PowerShell (recommended)
powershell -ExecutionPolicy Bypass -File dev-stop.ps1

# Or via npm script
bun run dev:stop

# Or batch file
dev-stop.bat
```

**Option 3: Double-click**
- Double-click `dev-stop.bat` in Windows Explorer

## Port Configuration

Edit `.env` to change ports:

```env
# Vite dev server (frontend with hot reload)
VITE_PORT=5173

# Express server (backend API)
PORT=3006

# OpenCode CLI (AI backend)
OPENCODE_PORT=3358
```

After changing ports, restart the dev servers.

## Development Workflow

### Active Development (with hot reload)
```bash
bun run dev
```
- Edit files in `src/` → changes appear instantly in browser
- No need to rebuild or refresh manually
- Best for UI/frontend work

### Testing Built Version
```bash
bun run build    # Build once
openkot          # Run built version
```
- Tests the production build
- No hot reload
- Best for final testing before deployment

## Troubleshooting

### Port Already in Use
If you see `Failed to start server on port XXXX`:

1. **Stop all dev servers:**
   ```bash
   bun run dev:stop
   ```

2. **Or manually kill processes:**
   ```bash
   # PowerShell
   powershell -ExecutionPolicy Bypass -File dev-stop.ps1
   
   # Batch
   dev-stop.bat
   ```

3. **Then restart:**
   ```bash
   bun run dev
   ```

### Process Won't Die
If `dev-stop` doesn't work:

```powershell
# Find what's using the port
netstat -ano | findstr :3358

# Kill by PID (replace XXXXX with actual PID)
taskkill /F /PID XXXXX
```

### Stale Connections
If you see many `TIME_WAIT` connections, they'll clear automatically in 30-120 seconds. Just wait or change the port in `.env`.

## Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| Start dev | `bun run dev` | Start all dev servers with hot reload |
| Stop dev | `bun run dev:stop` | Stop all dev servers |
| Build | `bun run build` | Build production files to `dist/` |
| Run built | `openkot` | Run production build (requires `bun run build` first) |
| Frontend only | `bun run dev:frontend` | Run Vite only (no backend) |
| Backend only | `bun run dev:server` | Run Express + OpenCode only |

## Files

- `dev-start.bat` - Start dev servers (Windows)
- `dev-stop.bat` - Stop dev servers (Windows batch)
- `dev-stop.ps1` - Stop dev servers (PowerShell, more reliable)
- `kill-port-3358.bat` - Kill specific port (legacy)
- `kill-port-3358.ps1` - Kill specific port (legacy)

## Tips

1. **Always use `Ctrl+C` to stop** - cleanest way to stop servers
2. **Change ports in `.env`** - avoid conflicts with other projects
3. **Use `dev-stop` if stuck** - kills all related processes
4. **Check `netstat`** - see what's using ports
5. **Wait for TIME_WAIT** - TCP connections take time to close

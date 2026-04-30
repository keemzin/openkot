# Agent Guidelines for OpenKot

## Project Overview

This project uses **Bun** (not NPM) as its primary runtime and package manager.

This is a **web-based UI for OpenCode** — a chat interface that proxies requests to the OpenCode CLI binary. The architecture combines a React-based frontend with an Express proxy server:

```
React Frontend (src/main.tsx)
     ↓ HTTP/WebSocket
Express Server (server/index.js)
     ↓ Proxy /api/* → OpenCode CLI (port 3358)
     ↓ Direct handlers for /api/fs/*, /api/git/*, /api/terminal/*, /api/question/*
OpenCode Binary (vendor/opencode/opencode.exe)
```

## Key Architecture Principles

1. **Component-based architecture**: `src/App.tsx` (~2,600 lines) remains the main orchestrator; UI components are in `src/components/` (chat, git, filetree, terminal, ui, app).
2. **Local state management**: UI state (theme, sidebar, models, agents, sessions) uses React local state with useState hooks. No external state library is used.
3. **Proxy pattern**: Server proxies most `/api/*` requests to OpenCode, handles filesystem/git/terminal/question directly.
4. **OpenCode compatibility**: Uses the same API contracts as the OpenCode CLI.
5. **Bun runtime**: Uses Bun for package management and server runtime (`bun run server`).

### File Reading Limitations
- **`.env` files cannot be read while server is running** — Windows file locking prevents reading config files that are in use.
- **Workaround**: Use the file tree panel to view `.env` files, or stop the server temporarily.

## Directory Structure

```
├── src/
│   ├── App.tsx              # Main orchestrator (~2,600 lines)
│   ├── stores/
│   │   └── preferencesStore.ts # Font preferences (used by FontPicker)
│   ├── constants/         # Static constants (themes.ts)
│   ├── styles/            # CSS files (prism.css)
│   ├── components/
│   │   ├── app/          # App-level components (AgentSelector, DirPicker, FontPicker, McpForm, PermissionCard, QuestionCard, SettingsDialog)
│   │   ├── chat/         # Chat components
│   │   ├── git/          # Git components
│   │   ├── filetree/     # File tree components
│   │   ├── terminal/     # Terminal components
│   │   └── ui/          # UI primitives
│   ├── utils/           # Shared utilities
│   ├── index.css        # Global styles + CSS variables
│   ├── main.tsx         # React entry point
│   └── types.ts        # TypeScript interfaces
├── server/
│   └── index.js         # Express server (~1,200 lines) with OpenCode proxy + direct APIs
├── .opencode/
│   ├── commands/        # Slash commands (dive.md, explore.md, etc.)
│   ├── skills/          # Specialized toolsets (crawl4ai, etc.)
│   ├── opencode.jsonc   # OpenCode configuration (MCP, etc.)
│   └── package.json     # MCP tool dependencies
├── vendor/
│   └── opencode/
│       └── opencode.exe # OpenCode binary (Windows)
├── .env                 # Configuration (ports, paths, version)
└── WORKSPACE/           # Current working directory for this instance
```

## Important Rules

### File Modification Scope
- **ONLY modify files in the current working directory** (`WORKSPACE/` or subdirectories).
- **DO NOT modify root-level code** (`src/`, `server/`, `.opencode/`) unless explicitly requested.

### Package Manager
- **Always use `bun`** commands: `bun install`, `bun run dev`, `bun run server`.

### Reference Implementation
- **REFER/openchamber** contains the canonical implementation for API contracts, rendering patterns, and terminal protocol.

## API Endpoints Reference

### Permission API (Handled by Server)
- `POST /api/permission/reply` — Reply to a permission request. Body: `{ sessionID, requestID, reply: "once"|"always"|"reject", directory }`. Proxied to OpenCode at `/permission/:requestID/reply`.

### MCP Config API (Handled by Server)
- `GET /api/config/mcp` — List all MCP servers from `.opencode/opencode.jsonc`.
- `GET /api/config/mcp/:name` — Get a single MCP server config.
- `POST /api/config/mcp/:name` — Create/replace an MCP server entry.
- `PATCH /api/config/mcp/:name` — Update fields of an existing MCP server.
- `DELETE /api/config/mcp/:name` — Remove an MCP server entry.
- Config file: `.opencode/opencode.jsonc` — written as plain JSON (comments lost on edit, which is expected).
- **Important**: All write endpoints are async (`fs.promises.writeFile`) to avoid Bun's `WriteFailed` panic on Windows.

### OpenCode Proxy
- `POST /api/chat` — Send message, returns SSE stream.
- `POST /api/session/:id/fork` — Fork session from a specific message.
- `GET /api/command` — List slash commands from `.opencode/commands/*.md`.

### Filesystem & Git APIs (Handled by Server)
- Standard CRUD operations at `/api/fs/*`.
- Git status, stage, commit, push, pull, diff at `/api/git/*`.
- **Note**: `WORKING_DIR` can be absolute or relative to project root.

### Terminal API
- `WS /api/terminal/ws` — WebSocket for terminal I/O (openchamber protocol v2).
- `POST /api/terminal/create` — Create terminal session for specific working directory.
- `DELETE /api/terminal/:sessionId` — Stop terminal session.
- PTY backend uses `bun-pty` or `node-pty` with fallback logic.
- **Directory-bound sessions** — one session per working directory, automatically managed.

## Agent & Model Configuration

### Agent Modes
- **Build**: Default mode with full tool permissions.
- **Plan**: Read-only/planning mode (edit tools denied, allows `question` and `plan_exit`).
- Agent is sent in the API request: `{ agent: "build" | "plan" }`.

### MCP Integration
- Configuration in `.opencode/opencode.jsonc`.
- Server automatically enables MCP servers (searxng, fetch, etc.) on startup via the `/mcp` endpoint on OpenCode.
- **Default OpenCode Port**: `3358` (set in `.env`). CLI auto-picks free ports.

## Common Tasks

### Adding a New Slash Command
1. Create `.opencode/commands/mycommand.md` with frontmatter (`name`, `description`, `agent`).
2. Use `$ARGUMENTS` for user input.

### Adding a New Tool Rendering
1. Add to `TOOL_GROUP_LABEL` and rendering logic in `src/utils/toolUtils.ts`.
2. Update `ToolPart` in `src/components/chat/ToolPart.tsx` for custom UI.
3. Supported types include: `bash`, `read`, `write`, `edit`, `grep`, `glob`, `ask`, `task`, `webfetch`, `codesearch`, `todo`.

### Modifying Theme
1. Edit CSS variables in `src/index.css` or the theme definitions in `src/constants/themes.ts`.
2. Persisted via `localStorage['oc_theme']`.

## Troubleshooting

- **OpenCode Port**: Default is `3358` in `.env`. CLI auto-picks free ports.
- **Shell**: Prefer `cmd.exe` on Windows for better PTY compatibility.
- **Binary**: If OpenCode fails to start, check `vendor/opencode/` path.
- **CLI not found**: Run `bun link` from project root, ensure `~/.bun/bin` is in PATH.
- **Blank UI via CLI**: Run `bun run build` first — CLI serves `dist/` statically.
- **Bun `WriteFailed` panic on MCP save**: Only happens when server is spawned via `openkot` CLI with `stdio: "pipe"`. Fixed by using `stdio: "inherit"` in `cli/index.ts`. Do NOT revert to piped stdio.
- **MCP config edit works in `start.bat` but not `openkot`**: Same root cause as above — piped stdio causes Bun to crash on file writes.

## CLI (`openkot`)

The `openkot` CLI starts the full stack (Express server + OpenCode binary) from any directory.

### How it works
1. Resolves a free port for the web UI and OpenCode
2. Spawns `bun server/index.js` with env vars set (`PORT`, `OPENCODE_PORT`, `WORKING_DIR`)
3. The Express server starts OpenCode internally and serves `dist/` statically
4. Opens the browser automatically

### Setup
```bash
bun run build   # build frontend once
bun link        # register openkot globally
```

### Entry point
`cli/index.ts` — compiled/run directly by Bun via the `bin` field in `package.json`.

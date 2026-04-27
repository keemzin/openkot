# Agent Guidelines for OpenCode GUI

## Project Overview

This project uses **Bun** (not NPM) as its primary runtime and package manager.

This is a **web-based UI for OpenCode** — a chat interface that proxies requests to the OpenCode CLI binary. The architecture combines a React-based frontend with an Express proxy server:

```
React Frontend (src/main.tsx) 
    ↓ HTTP/WebSocket
Express Server (server/index.js)
    ↓ Proxy /api/* → OpenCode CLI (port 3356 or 4088)
    ↓ Direct handlers for /api/fs/*, /api/git/*, /api/terminal/*, /api/question/*
OpenCode Binary (vendor/opencode/opencode.exe)
```

## Key Architecture Principles

1. **Component-based architecture**: While `src/App.tsx` remains the main orchestrator (~3,500 lines), most UI components have been refactored into `src/components/` (chat, git, filetree, terminal, ui).
2. **Zustand state management**: UI state (theme, sidebar, models, agents) uses Zustand stores. Session state (messages, SSE) still uses local state.
3. **Proxy pattern**: Server proxies most `/api/*` requests to OpenCode, handles filesystem/git/terminal/question directly.
4. **OpenCode compatibility**: Uses the same API contracts as the OpenCode CLI.
5. **Bun runtime**: Uses Bun for package management and server runtime (`bun run server`).

## Known Limitations

### Question Tool (OpenCode v1.14.18)
- Question UI displays correctly when OpenCode asks questions via SSE events.
- Answers are sent to `/api/question/reply` → OpenCode at `/question/:requestID/reply`.
- Questions are NOT persisted (disappear on page refresh).

## State Management (Zustand)

This project uses Zustand for state management:

### Stores
- **`src/stores/uiStore.ts`**: Theme, sidebar, tabs, panels (in use)
- **`src/stores/settingsStore.ts`**: Models, agents, autopilot (in use)
- **`src/stores/sessionStore.ts`**: Messages, SSE (available but not yet wired)
- **`src/stores/dirStore.ts`**: Working dir, recent dirs (available but not yet wired)

### Adding a New Store
1. Create `src/stores/<name>Store.ts`
2. Use `create<StateInterface>` pattern
3. Import and wire incrementally in App.tsx
4. Test build after each change
- **API Discovery**: OpenCode endpoint is `/question/:requestID/reply` (with requestID as URL param).

### File Reading Limitations
- **`.env` files cannot be read while server is running** - Windows file locking prevents reading config files that are in use.
- **Workaround**: Use the file tree panel to view `.env` files, or stop the server temporarily.

## Recent Features Added

### Autopilot Auto-Approve Fix (2026-04-27)
- When **Autopilot is ON**, `permission.asked` SSE events are now auto-replied with `"always"` immediately — no card shown.
- Uses `autopilotRef` (a `useRef`) so the SSE closure always reads the current autopilot state, not a stale one.
- When **Autopilot is OFF**, the `PermissionCard` is shown as before.

### Permission Card `{}` Fix (2026-04-27)
- `PermissionCard.renderContent()` now handles `read` tool type (shows file path).
- Empty metadata (`{}`) now renders `null` instead of the literal string `{}`.

### QuestionCard Mojibake Fix (2026-04-27)
- Broken UTF-8 double-encoded emoji (`âš `, `âœï¸`, `â†'`, `âœ"`) replaced with plain text.
- Emoji font fallback added to `body` font-family: `'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'`.

### Browser Tab Title (2026-04-27)
- `index.html` title changed from `OpenCode` to `OpenKot`.

### MCP Config Write Fix (2026-04-27)
- `writeConfig` now uses `fs.promises.writeFile` (async) instead of `fs.writeFileSync` to avoid a Bun Windows bug (`WriteFailed` panic).
- All MCP endpoints (POST, PATCH, DELETE) are now `async` and `await` the write.
- JSONC parsing simplified to plain `JSON.parse` (no comment stripping needed since the UI writes clean JSON).

### CLI `openkot` stdio Fix (2026-04-27)
- **Root cause of Bun crash**: `cli/index.ts` was spawning the server with `stdio: ["ignore", "pipe", "pipe"]`. Piping stdout through the CLI process caused Bun to panic with `WriteFailed` when the server tried to write the config file.
- **Fix**: Changed to `stdio: ["ignore", "inherit", "inherit"]` — server writes directly to terminal.
- **Ready detection**: Replaced stdout-watching with health endpoint polling (`GET /health`).

### Skills & Sub-agents Support (2026-04-22)
- Added `.opencode/NOT_skills` for specialized toolsets (e.g., `crawl4ai`).
- Sub-agents like `explore` use the `task` tool to delegate complex investigations.
- Sub-sessions with `parentID` are automatically grouped under their parent session in the sidebar.

### Permission System & Autopilot (2026-04-23)
- Added **Autopilot/Permission toggle** in the chat toolbar.
- **Autopilot ON**: AI executes tools automatically.
- **Permission mode (Autopilot OFF)**: AI asks for user approval before executing sensitive tools (bash, write, edit, etc.).
- Handled via `permission.asked` SSE events and `PermissionCard` component.
- Responses sent to `/api/permission/reply` (once, always, reject).

### CodeMirror 6 Editor Upgrade (2026-04-23)
- Replaced standard `<textarea>` with **CodeMirror 6** for file editing.
- Features: Syntax highlighting, line numbers, bracket matching, and `Mod-S` (Ctrl+S) save support.
- Custom dark theme integrated with existing CSS variables.
- Component located at `src/components/editor/CodeEditor.tsx`.

### xterm.js Terminal & Directory-Bound Sessions (2026-04-24)
- Integrated **xterm.js terminal** for desktop with WebGL/canvas rendering.
- Mobile devices use a text-based fallback terminal with hidden textarea for keyboard input.
- **Directory-bound terminals** - one persistent terminal session per working directory with global session management.
- **Global terminal access** - available whenever working directory is set, independent of chat sessions.
- **Manual stop controls** - desktop ❌ button and mobile "Stop" button to terminate terminal sessions.
- **Automatic cleanup** - unused terminal sessions removed after 5 minutes of inactivity.
- Terminal uses WebSocket protocol at `/api/terminal/ws`.

### Git Panel & UI Improvements (2026-04-21)
- Redesigned Git changes list with status badges and file icons.
- Per-session model selection memory (persisted to localStorage).
- Directory picker shows relative paths for better identification.

### Image Preview & Path Support (2026-04-20)
- File viewer supports PNG, JPG, GIF, SVG, WEBP, BMP, ICO.
- `WORKING_DIR` supports relative paths (defaults to `WORKSPACE`).

## Directory Structure

```
├── src/
│   ├── App.tsx              # Main orchestrator (~1,200 lines, uses Zustand stores)
│   ├── stores/              # Zustand state management
│   │   ├── sessionStore.ts   # messages, partsMap, sessionId, streaming
│   │   ├── uiStore.ts      # sidebar, rightPanel, theme, tabs
│   │   ├── settingsStore.ts # models, agent, autopilot
│   │   ├── dirStore.ts     # workingDir, recentDirs, sessions
│   │   └── index.ts      # re-exports
│   ├── components/        # UI components
│   │   ├── app/          # Extracted dialog components
│   │   │   ├── FontPicker.tsx
│   │   │   ├── DirPicker.tsx
│   │   │   ├── PermissionCard.tsx
│   │   │   ├── QuestionCard.tsx
│   │   │   ├── McpForm.tsx
│   │   │   └── SettingsDialog.tsx
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
1. Edit CSS variables in `src/index.css` or the `THEMES` object in `src/App.tsx`.
2. Persisted via `localStorage['oc_theme']`.

## Refactoring Status (2026-04-23)

### Completed
- ✅ Zustand installed (`zustand@5.0.12`)
- ✅ Stores created in `src/stores/` (4 files)
- ✅ Components extracted to `src/components/app/` (6 files)
- ✅ Stores wired to App.tsx (theme, sidebar, rightPanel, model/agent/autopilot)
- ✅ PermissionCard - extracted
- ✅ FontPicker - extracted
- ✅ DirPicker - extracted
- ✅ QuestionCard - extracted
- ✅ McpForm - extracted
- ✅ SettingsDialog - extracted

All inline components have been extracted. Refactoring complete!

### How to Continue Refactoring
1. Run `bun run build` to verify baseline
2. For each component:
   - Remove inline `function ComponentName` definition
   - Keep the import at top of file
   - Build and verify after each removal
3. Update this file when complete

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

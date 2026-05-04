# Agent Guidelines for OpenKot

## Project Overview

This project uses **Bun** (not NPM) as its primary runtime and package manager.

This is a **web-based UI for OpenCode** — a chat interface that talks to the OpenCode CLI binary. The architecture combines a React-based frontend with an Express server that handles filesystem, git, terminal, and config operations directly, while OpenCode-specific operations now go through the official SDK.

Can always refer here to see if there is similar implementation or feature to be added: `REFER/openchamber`

```
React Frontend (src/main.tsx)
     ↓ SDK (direct, port 3358)              ↓ HTTP/WebSocket (via Express proxy)
OpenCode Binary (vendor/opencode)        Express Server (server/index.js)
                                              ↓ Direct handlers for:
                                              /api/fs/*, /api/git/*,
                                              /api/terminal/*,
                                              /api/config/*,
                                              /api/notifications/auto-accept,
                                              /api/sessions/:id/auto-accept,
                                              /health, /config, /restart, /switch-dir
```

## Key Architecture Principles

1. **Component-based architecture**: `src/App.tsx` (~1,500 lines) is the main orchestrator; UI components are in `src/components/` (chat, git, filetree, terminal, ui, app). Custom hooks are in `src/hooks/`.
2. **Local state management**: UI state (theme, sidebar, models, agents, sessions) uses React local state with useState hooks. No external state library is used.
3. **SDK for OpenCode operations**: All OpenCode-specific API calls (sessions, messages, providers, commands, events, permissions, questions) use `@opencode-ai/sdk` v2 via `src/lib/opencode.ts`.
4. **Express for custom operations**: Filesystem, git, terminal, MCP config, autopilot/auto-accept logic, and server management stay as Express routes — the SDK does not cover these.
5. **Bun runtime**: Uses Bun for package management and server runtime (`bun run server`).

### File Reading Limitations
- **`.env` files cannot be read while server is running** — Windows file locking prevents reading config files that are in use.
- **Workaround**: Use the file tree panel to view `.env` files, or stop the server temporarily.

## Directory Structure

```
├── src/
│   ├── App.tsx              # Main orchestrator (~1,500 lines)
│   ├── lib/
│   │   └── opencode.ts      # SDK client singleton (v2, direct to OpenCode port)
│   ├── stores/
│   │   └── preferencesStore.ts # Font preferences (used by FontPicker)
│   ├── hooks/
│   │   └── useSessionEvents.ts # SSE event stream via SDK (client.global.event())
│   ├── constants/           # Static constants (themes.ts)
│   ├── styles/              # CSS files (prism.css)
│   ├── components/
│   │   ├── app/             # App-level components
│   │   ├── chat/            # Chat components
│   │   ├── git/             # Git components
│   │   ├── filetree/        # File tree components
│   │   ├── terminal/        # Terminal components
│   │   ├── ui/              # UI primitives
│   │   ├── Sidebar.tsx      # Session sidebar
│   │   └── ModelSelector.tsx # Model selection dropdown
│   ├── utils/               # Shared utilities
│   ├── index.css            # Global styles + CSS variables
│   ├── main.tsx             # React entry point
│   └── types.ts             # TypeScript interfaces
```

## SDK Integration (`src/lib/opencode.ts`)

The SDK client connects **directly** to the OpenCode binary, bypassing the Express proxy.

```typescript
import { getClient } from './lib/opencode';
const client = await getClient();
```

- Port is read from `/config` at startup (`opencodePort` field) so it works with dynamic port assignment from the CLI.
- Always connects to `127.0.0.1:{port}` — never the bind address (`0.0.0.0`).
- Every SDK call passes `{ directory }` explicitly — this replaces the proxy's `x-opencode-directory` header injection.
- OpenCode is spawned with `--cors` flags so the browser can make direct cross-origin requests.

### What Uses the SDK (v2)

| Operation | SDK Method |
|---|---|
| List sessions | `client.session.list({ directory })` |
| Create session | `client.session.create({ directory })` |
| Delete session | `client.session.delete({ sessionID, directory })` |
| Rename session | `client.session.update({ sessionID, directory, title })` |
| Session status | `client.session.status({ directory })` |
| Load messages | `client.session.messages({ sessionID, directory })` |
| Send message | `client.session.promptAsync({ sessionID, directory, model: { providerID, modelID }, parts, agent })` |
| Fork session | `client.session.fork({ sessionID, directory, messageID })` |
| Revert session | `client.session.revert({ sessionID, directory, messageID })` |
| Abort session | `client.session.abort({ sessionID, directory })` |
| List providers | `client.provider.list({ directory })` |
| List commands | `client.command.list({ directory })` |
| Permission reply | `client.permission.reply({ requestID, reply, directory })` |
| Permission list (recovery) | `client.permission.list({ directory })` |
| Question reply | `client.question.reply({ requestID, answers, directory })` |
| Question reject | `client.question.reject({ requestID, directory })` |
| SSE event stream | `client.global.event()` → `result.stream` async generator |

### SDK Response Shape

The v2 SDK wraps all responses in `{ data: ... }`. Always unwrap:
```typescript
const resp: any = await client.session.list({ directory });
const data = resp?.data ?? resp; // safe unwrap
```

### Model Selection

`promptAsync` takes model as a **nested object**:
```typescript
model: { providerID: selectedModel.providerId, modelID: selectedModel.id }
```
Not flat fields. The `providerID` is the provider key (e.g. `"kilo"`, `"opencode"`) and `modelID` is the bare model ID (e.g. `"tencent/hy3-preview:free"`).

Only models from **connected** providers appear in the model list. Connected providers are in `data.connected` from `provider.list()`.

### What Stays as Express Routes (NOT SDK)

These are custom server-side operations the SDK doesn't cover:

| Operation | Route |
|---|---|
| Filesystem CRUD | `/api/fs/*` |
| Git operations | `/api/git/*` |
| Terminal (PTY) | `/api/terminal/*`, `WS /api/terminal/ws` |
| Autopilot toggle | `/api/notifications/auto-accept` |
| Session auto-accept lineage | `/api/sessions/:id/auto-accept` |
| MCP config CRUD | `/api/config/mcp/*` |
| Custom providers config | `/api/config/providers/custom/*` |
| Commands config (editor) | `/api/config/commands/*` |
| Server health | `/health` |
| Server config (port, dir) | `/config` |
| Restart OpenCode | `/restart` |
| Switch working directory | `/switch-dir` |

## Important Rules

### File Modification Scope
- **ONLY modify files in the current working directory** (`WORKSPACE/` or subdirectories).
- **DO NOT modify root-level code** (`src/`, `server/`, `.opencode/`) unless explicitly requested.

### Package Manager
- **Always use `bun`** commands: `bun install`, `bun run dev`, `bun run server`.

### Reference Implementation
- **REFER/openchamber** contains the canonical implementation for rendering patterns and terminal protocol.

## API Endpoints Reference

### Permission API (via SDK)
- `client.permission.list({ directory })` — list pending permission requests (used for recovery after refresh)
- `client.permission.reply({ requestID, reply, directory })` — reply `"once"|"always"|"reject"` to a permission request
- **Persistence**: Permissions are persisted to `localStorage` (key: `oc_permissions`) and recovered on page load via SDK.
- **Autopilot**: Per-session auto-accept is managed by Express (`/api/notifications/auto-accept`, `/api/sessions/:id/auto-accept`) — this is custom logic not in the SDK.

### MCP Config API (Handled by Server)
- `GET /api/config/mcp` — List all MCP servers from `.opencode/opencode.jsonc`.
- `GET /api/config/mcp/:name` — Get a single MCP server config.
- `POST /api/config/mcp/:name` — Create/replace an MCP server entry.
- `PATCH /api/config/mcp/:name` — Update fields of an existing MCP server.
- `DELETE /api/config/mcp/:name` — Remove an MCP server entry.
- Config file: `.opencode/opencode.jsonc` — written as plain JSON (comments lost on edit, which is expected).
- **Important**: All write endpoints are async (`fs.promises.writeFile`) to avoid Bun's `WriteFailed` panic on Windows.

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
- Agent is sent in the SDK call: `{ agent: "build" | "plan" }`.

### MCP Integration
- Configuration in `.opencode/opencode.jsonc`.
- Server automatically enables MCP servers (searxng, fetch, etc.) on startup via the `/mcp` endpoint on OpenCode.
- **Default OpenCode Port**: `3358` (set in `.env`). CLI auto-picks free ports.

### MCP Tools Usage

#### Sequential Thinking
Use `sequential-thinking` MCP for complex, multi-step problems that require:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope isn't clear initially

**DO NOT use** for simple tasks (listing files, reading single files, quick answers) — it adds unnecessary overhead.

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

## Vite Build Notes

The SDK uses Node.js globals that don't exist in the browser. These are polyfilled in `vite.config.ts`:
```typescript
define: {
  'process.env': {},
  'process.platform': JSON.stringify('browser'),
  'process.version': JSON.stringify(''),
  'global': 'globalThis',
}
```
Do not remove these — the build will fail with `process is not defined` or `global is not defined`.

## Troubleshooting

- **OpenCode Port**: Default is `3358` in `.env`. CLI auto-picks free ports — always read from `/config`.
- **Shell**: Prefer `cmd.exe` on Windows for better PTY compatibility.
- **Binary**: If OpenCode fails to start, check `vendor/opencode/` path.
- **CLI not found**: Run `bun link` from project root, ensure `~/.bun/bin` is in PATH.
- **Blank UI via CLI**: Run `bun run build` first — CLI serves `dist/` statically.
- **Bun `WriteFailed` panic on MCP save**: Only happens when server is spawned via `openkot` CLI with `stdio: "pipe"`. Fixed by using `stdio: "inherit"` in `cli/index.ts`. Do NOT revert to piped stdio.
- **SDK CORS errors**: OpenCode must be spawned with `--cors` flags (done in `server/index.js`). If you see CORS errors, restart the server so OpenCode picks up the flags.
- **Models not loading**: Only connected providers show models. Check `data.connected` from `provider.list()`. If empty, no API keys are configured.
- **Model stuck / not switching**: Verify `promptAsync` sends `model: { providerID, modelID }` as a nested object, not flat fields.
- **UI stuck after bad model**: `promptAsync` is called before `listenToSession` — if the prompt fails, the error is caught and shown immediately without opening a hanging SSE stream.
- **Restart fails sometimes**: Fixed in `server/index.js` — `currentWorkingDir` is only set AFTER OpenCode starts successfully, not before.

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

## Refactoring Status

### Current State
- `src/App.tsx` is ~1,500 lines — consider extracting:
  - **Permission logic**: Move permission state + recovery to a custom hook (`usePermissions`)
  - **Question logic**: Extract question handling to `useQuestions` hook
  - **Session management**: Extract `useSessionManager` hook
  - **Trail rendering**: The "trail" logic for tool grouping could be a separate component

### Suggested Refactors (when needed)
1. **Extract `usePermissions` hook**: Permission state, localStorage persistence, API recovery
2. **Extract `useQuestions` hook**: Question state + reply/reject logic
3. **Extract `useSessionManager` hook**: Session CRUD, switching, status — build on existing `useSessionEvents` pattern
4. **Create `PermissionCard` container**: Move recovery logic out of App.tsx
5. **Trail/ToolGroup improvements**: Extract trail rendering, create `<Trail>` component

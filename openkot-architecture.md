# OpenKot Architecture

## Overview

OpenKot is a multi-device AI chat interface that proxies OpenCode CLI behind Express + Vite. The UI is React 18 with TypeScript, and the backend runs on Bun/Node.

## Architecture Layers

```
Browser (React SPA)
    │
    ▼ Vite Dev Server (port 5173)
    │  Proxies: /api/*, /health, /config → Express
    │  Proxies: /api/terminal/ws (WebSocket) → Express
    │
    ▼ Express Server (port 3006)
    │  Routes: /api/terminal/*, /api/fs/*, /api/git/*, /api/config/*
    │  Proxy: /api/* (remaining) → OpenCode (port 3358)
    │
    ▼ OpenCode CLI (port 3358)
       AI backend, MCP servers, session management
```

## File Map

### Core Entry

| File | Role |
|------|------|
| `src/App.tsx` | Root React component. State, message sending, session management, UI layout |
| `src/main.tsx` | React DOM entry point |
| `server/index.js` | Express server. Routes, terminal, proxy, OpenCode lifecycle |
| `server/permission.js` | Permission module stub (autopilot removed) |

### SDK Layer

| File | Role |
|------|------|
| `src/lib/opencode.ts` | OpenCode SDK v2 client singleton. Custom timeoutFetch |
| `src/hooks/useSessionEvents.ts` | SSE event stream listener. Auto-reconnect with backoff |

### State & Types

| File | Role |
|------|------|
| `src/types.ts` | All TypeScript types: Message, Part, ModelInfo, PermissionRequest, etc. |
| `src/stores/preferencesStore.ts` | Zustand store for UI/mono fonts, streaming mode |
| `src/stores/streamingStore.ts` | Zustand store for streaming state: partsMap, streamingMsgId, delta batch flush |
| `src/stores/utils/permissionAutoAccept.ts` | Session lineage auto-accept resolver (unused) |

### UI Components

| File | Role |
|------|------|
| `src/components/chat/ChatMessages.tsx` | Turn rendering component, subscribes to Zustand streaming store |
| `src/components/chat/ChatMessage.tsx` | Single chat message (user bubble or assistant text) |
| `src/components/chat/ToolGroup.tsx` | Tool trail view (collapsible tool cards) |
| `src/components/chat/ToolPart.tsx` | Expandable tool content (diff, output, input) |
| `src/components/chat/ToolLabel.tsx` | Tool name label with icon |
| `src/components/chat/DiffViewer.tsx` | File diff display |
| `src/components/chat/Markdown.tsx` | Markdown renderer |
| `src/components/Sidebar.tsx` | Session list, dir picker, pinned sessions |
| `src/components/ModelSelector.tsx` | Model picker dropdown |
| `src/components/AgentSelector.tsx` | Build/Plan agent toggle |
| `src/components/app/SettingsDialog.tsx` | Settings (model visibility, config) |
| `src/components/app/PermissionCard.tsx` | Permission request UI |
| `src/components/app/QuestionCard.tsx` | Question request UI |
| `src/components/app/SessionItem.tsx` | Session list item |
| `src/components/app/DirPicker.tsx` | Directory selector |
| `src/components/app/InstancesPanel.tsx` | Multi-instance panel |
| `src/components/app/PlanView.tsx` | Plan file viewer |
| `src/components/app/McpForm.tsx` | MCP server config form |
| `src/components/app/FontPicker.tsx` | Font preferences |
| `src/components/filetree/FileTreePanel.tsx` | File tree panel |
| `src/components/filetree/FileTreeNode.tsx` | Tree node component |
| `src/components/filetree/FileViewer.tsx` | File content viewer |
| `src/components/filetree/ContextMenu.tsx` | Right-click context menu |
| `src/components/editor/CodeEditor.tsx` | CodeMirror editor |
| `src/components/terminal/DesktopTerminal.tsx` | xterm.js terminal (desktop) |
| `src/components/terminal/MobileTerminal.tsx` | Terminal (mobile) |
| `src/components/git/GitPanel.tsx` | Git status panel |
| `src/components/git/GitDiffViewer.tsx` | Git diff display |
| `src/components/ui/RightPanel.tsx` | Resizable right panel wrapper |
| `src/components/ui/TokenUsageIndicator.tsx` | Context usage bar |

### Utilities

| File | Role |
|------|------|
| `src/utils/helpers.ts` | uid(), terminal manager, contextUsage calc, clipboard fallback, ANSI processing |
| `src/utils/toolUtils.ts` | Tool summary, diff compute, oneliners |
| `src/utils/toolPresentation.ts` | Tool display names, icons, descriptions |
| `src/utils/toolCategorization.ts` | Tool type classification (diff, expandable, group) |
| `src/utils/fileUtils.ts` | File extension helpers |
| `src/utils/fileOpenListener.ts` | File open event emitter |
| `src/utils/gitUtils.ts` | Git helper functions |
| `src/constants/themes.ts` | Theme definitions (dark/light variants) |

### Config

| File | Role |
|------|------|
| `config.json` | OpenCode config: providers, MCP servers, permissions, commands |
| `vite.config.ts` | Vite config with proxy rules |
| `package.json` | Dependencies and scripts |

## Key Data Flow: Send Message

1. User types message → `sendMessage()` in App.tsx
2. Adds optimistic user message via temp ID (`temp_user_*`)
3. Sets `isLoading(true)`, adds placeholder assistant message (`temp_asst_*`)
4. Calls `getOrCreateSession()` → creates session via SDK
5. Calls `client.session.promptAsync()` with model, parts, agent
6. On success: calls `listenToSession(sid, tempAssistantId)`
7. SSE stream delivers events → deltas buffered & rAF-flushed into Zustand store; ChatMessages subscribes directly

## SSE Event Stream (useSessionEvents)

- Creates `AbortController`, starts async IIFE
- Connects to `client.event.subscribe({ directory })` → AsyncIterable
- For-await loop processes events:
  - `message.part.delta` → buffered in Map, flushed via requestAnimationFrame to Zustand store atomically
  - `message.part.updated` → replaces/replaces part
  - `message.updated` → replaces temp IDs with real IDs
  - `session.idle` → stops loading, cleans up, breaks loop
  - `session.error` → shows error, cleans up, breaks loop
  - `permission.asked` → shows permission card
  - `question.asked` → shows question card
- On unexpected disconnect: exponential backoff reconnect (500ms → 10s max)

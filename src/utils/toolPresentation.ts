/** Maps tool names to display labels and SVG icon paths */

export function getToolDisplayName(toolName: string): string {
  const t = toolName.toLowerCase();
  const map: Record<string, string> = {
    edit: 'Edited', multiedit: 'Edited', apply_patch: 'Edited',
    str_replace: 'Edited', str_replace_based_edit_tool: 'Edited',
    write: 'Wrote', create: 'Wrote', file_write: 'Wrote',
    read: 'Read', view: 'Read', file_read: 'Read', cat: 'Read',
    bash: 'Shell Command', shell: 'Shell Command', cmd: 'Shell Command',
    list: 'Listed', ls: 'Listed', dir: 'Listed', list_files: 'Listed',
    grep: 'Search Files', search: 'Search Files', find: 'Find Files',
    ripgrep: 'Search Files',
    glob: 'Find Files',
    webfetch: 'Fetched', fetch: 'Fetched', curl: 'Fetched', wget: 'Fetched',
    websearch: 'Searched Web', web_search: 'Searched Web', codesearch: 'Searched Web',
    searxng_searxng_web_search: 'Searched',
    todowrite: 'Updated Todos', todoread: 'Read Todos',
    task: 'Delegated Task',
    question: 'Asked Question',
    plan_enter: 'Entered Plan Mode', plan_exit: 'Exited Plan Mode',
  };

  // MCP-style: fetch_fetch_markdown → Fetch Markdown
  if (map[t]) return map[t];

  // git* tools
  if (t.startsWith('git')) return 'Git ' + t.slice(3).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // MCP underscore names: jina_read_url → Jina Read Url
  return toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Returns an SVG path string for the tool icon */
export function getToolIconPath(toolName: string): string {
  const t = toolName.toLowerCase();

  if (t === 'edit' || t === 'multiedit' || t === 'apply_patch' || t === 'str_replace' || t === 'str_replace_based_edit_tool')
    return 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z';
  if (t === 'write' || t === 'create' || t === 'file_write')
    return 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6';
  if (t === 'read' || t === 'view' || t === 'file_read' || t === 'cat')
    return 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8';
  if (t === 'bash' || t === 'shell' || t === 'cmd' || t === 'terminal')
    return 'M4 17l6-6-6-6M12 19h8';
  if (t === 'list' || t === 'ls' || t === 'dir' || t === 'list_files')
    return 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z';
  if (t === 'grep' || t === 'search' || t === 'find' || t === 'ripgrep')
    return 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM10 7v3m0 0v3m0-3h3m-3 0H7';
  if (t === 'glob')
    return 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z';
  if (t === 'webfetch' || t === 'fetch' || t === 'curl' || t === 'wget')
    return 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z';
  if (t === 'websearch' || t === 'web_search' || t === 'codesearch' || t.includes('web_search') || t.includes('searxng'))
    return 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z';
  if (t === 'todowrite' || t === 'todoread')
    return 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11';
  if (t === 'task')
    return 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 8v4l3 3';
  if (t === 'question')
    return 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01';
  if (t.startsWith('git'))
    return 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9';

  // default wrench
  return 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z';
}

export function getToolDescription(toolName: string, state: any): string {
  const t = toolName.toLowerCase();
  const input = state?.input ?? {};

  if (t === 'bash' || t === 'shell' || t === 'cmd') {
    const cmd = input.command ?? input.cmd ?? '';
    return typeof cmd === 'string' ? cmd.split('\n')[0].slice(0, 80) : '';
  }
  if (t === 'read' || t === 'view' || t === 'file_read' || t === 'cat' ||
      t === 'write' || t === 'create' || t === 'file_write' ||
      t === 'edit' || t === 'multiedit' || t === 'apply_patch') {
    const p = input.filePath ?? input.file_path ?? input.path ?? '';
    if (typeof p === 'string' && p) {
      const parts = p.replace(/\\/g, '/').split('/');
      return parts[parts.length - 1] ?? p;
    }
  }
  if (t === 'grep' || t === 'search' || t === 'find' || t === 'ripgrep') {
    const q = input.pattern ?? input.query ?? '';
    return typeof q === 'string' ? `"${q.slice(0, 60)}"` : '';
  }
  if (t === 'glob') {
    const p = input.pattern ?? input.glob ?? '';
    return typeof p === 'string' ? `"${p.slice(0, 60)}"` : '';
  }
  if (t === 'webfetch' || t === 'fetch' || t === 'curl' || t === 'wget') {
    const url = input.url ?? input.URL ?? '';
    return typeof url === 'string' ? url.slice(0, 80) : '';
  }
  if (t.includes('web_search') || t.includes('searxng') || t === 'websearch' || t === 'codesearch') {
    const q = input.query ?? input.q ?? '';
    return typeof q === 'string' ? `"${q.slice(0, 60)}"` : '';
  }
  // MCP tools: try url, query, pattern, path
  const fallback = input.url ?? input.query ?? input.pattern ?? input.path ?? input.filePath ?? '';
  return typeof fallback === 'string' ? fallback.slice(0, 80) : '';
}

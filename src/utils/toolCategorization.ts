const EXPANDABLE_TOOL_NAMES = new Set<string>([
    'edit', 'multiedit', 'apply_patch', 'str_replace', 'str_replace_based_edit_tool',
    'bash', 'shell', 'cmd', 'terminal',
    'write', 'create', 'file_write',
    'question', 'task',
]);

const STANDALONE_TOOL_NAMES = new Set<string>(['task']);

const SEARCH_TOOL_NAMES = new Set<string>(['grep', 'search', 'find', 'ripgrep', 'glob']);

export const DIFF_TOOLS = new Set<string>([
    'edit', 'multiedit', 'write', 'create', 'file_write', 'patch', 'apply_patch'
]);

export function normalizeToolName(toolName: unknown): string {
    if (typeof toolName !== 'string') return '';
    const trimmed = toolName.trim().toLowerCase();
    if (!trimmed) return '';

    const withoutIndex = trimmed.replace(/:\d+$/, '');
    if (withoutIndex.includes('.')) {
        const parts = withoutIndex.split('.').filter(Boolean);
        return parts[parts.length - 1] ?? withoutIndex;
    }
    return withoutIndex;
}

export function isExpandableTool(toolName: unknown): boolean {
    return EXPANDABLE_TOOL_NAMES.has(normalizeToolName(toolName));
}

export function isStandaloneTool(toolName: unknown): boolean {
    return STANDALONE_TOOL_NAMES.has(normalizeToolName(toolName));
}

export function isSearchTool(toolName: unknown): boolean {
    return SEARCH_TOOL_NAMES.has(normalizeToolName(toolName));
}

export function isDiffTool(toolName: unknown): boolean {
    return DIFF_TOOLS.has(normalizeToolName(toolName));
}

const LABELS: Record<string, string> = {
    grep: 'Searched',
    glob: 'Explored',
    read: 'Read',
    write: 'Wrote',
    edit: 'Edited',
    bash: 'Ran',
    task: 'Tasked',
    webfetch: 'Fetched',
    websearch: 'Searched',
    searxng_searxng_web_search: 'Searched',
    codesearch: 'Searched',
    todowrite: 'Updated todos',
    todo: 'Checked todos',
};

export function getGroupLabel(toolName: string): string {
    const normalized = normalizeToolName(toolName);
    return LABELS[normalized] ?? (toolName.charAt(0).toUpperCase() + toolName.slice(1));
}
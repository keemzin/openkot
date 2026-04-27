export function getFileExt(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function fileColor(name: string): string {
  const ext = getFileExt(name);
  const map: Record<string, string> = {
    ts: '#3b82f6', tsx: '#3b82f6', js: 'var(--accent)', jsx: 'var(--accent)',
    json: 'var(--green)', md: 'var(--text-2)', css: 'var(--red)', html: 'var(--red)',
    py: '#3b82f6', rs: 'var(--red)', go: 'var(--blue)', sh: 'var(--green)',
  };
  return map[ext] ?? 'var(--text-3)';
}
export type GitFileStatus = { index: string; workdir: string };

export type GitStatus = { isRepo: boolean; files: Record<string, GitFileStatus> };

export function gitStatusColor(s?: GitFileStatus): string | null {
  if (!s) return null;
  if (s.index === 'A' || s.workdir === '?') return 'var(--green)';
  if (s.index === 'D' || s.workdir === 'D') return 'var(--red)';
  if (s.index === 'M' || s.workdir === 'M' || s.index === 'R') return 'var(--orange)';
  return null;
}

export function gitStatusLabel(s?: GitFileStatus): string | null {
  if (!s) return null;
  if (s.index === 'A') return 'A';
  if (s.workdir === '?') return '?';
  if (s.index === 'D' || s.workdir === 'D') return 'D';
  if (s.index === 'M' || s.workdir === 'M') return 'M';
  if (s.index === 'R') return 'R';
  return null;
}
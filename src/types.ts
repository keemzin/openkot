export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: any[];
  reasoning?: string;
  tokens?: { 
    input?: number; 
    output?: number; 
    reasoning?: number; 
    cache_read?: number;   // flat format (legacy)
    cache_write?: number;  // flat format (legacy)
    cache?: { read?: number; write?: number }; // nested format (OpenCode actual)
  };
  cost?: number;
  model?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  isDefault: boolean;
  isFree: boolean;
  contextLimit?: number;
}

export interface SessionContextUsage {
  totalTokens: number;
  percentage: number;
  contextLimit: number;
  outputLimit?: number;
  normalizedOutput?: number;
  thresholdLimit: number;
}

export interface SessionInfo {
  id: string;
  title?: string;
  time?: { created?: number; updated?: number };
  parentID?: string | null; // For sub-sessions (e.g., explore agent)
}

export interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export type InlineEdit =
  | { parentPath: string; type: 'newFile' | 'newFolder' }
  | { entryPath: string; type: 'rename'; currentName: string };

export interface CtxMenu {
  x: number;
  y: number;
  entry: FsEntry;
}

export type GitFileStatus = { index: string; workdir: string };

export type GitStatus = { isRepo: boolean; files: Record<string, GitFileStatus> };

export type Part = {
  id: string;
  type: string;
  text?: string;
  tool?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  output?: string;
  state?: unknown;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type MessageRecord = {
  info: { id: string; role: 'user' | 'assistant'; time?: { created?: number }; tokens?: Message['tokens'] };
  parts: Part[];
};

export type QuestionOption = { label: string; description: string };
export type QuestionInfo = { question: string; header: string; options: QuestionOption[]; multiple?: boolean };
export type QuestionRequest = {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: { messageID: string; callID: string };
};

export type PermissionRequest = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, any>;
  always: string[];
};

export type ContentSearchResult = FsEntry & {
  relativePath: string;
  line_number: number;
  line: string;
  match: string;
};

export const SYMBOL_KINDS: Record<number, string> = {
  1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class',
  6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum',
  11: 'Interface', 12: 'Function', 13: 'Variable', 14: 'Constant',
  15: 'String', 16: 'Number', 17: 'Boolean', 18: 'Array', 19: 'Object',
  20: 'Key', 21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event',
  25: 'Operator', 26: 'TypeParameter',
};

export type SymbolSearchResult = FsEntry & {
  relativePath: string;
  kind: number;
  line_number: number;
};
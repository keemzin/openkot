import { create } from 'zustand';

export type AgentScope = 'user' | 'project';
export type PermissionAction = 'allow' | 'ask' | 'deny';
export type PermissionRule = { permission: string; pattern: string; action: PermissionAction };
type PermissionConfigValue = PermissionAction | Record<string, PermissionAction>;
export type PermissionConfig = PermissionConfigValue | Record<string, PermissionConfigValue>;

export interface AgentConfig {
  name: string;
  description?: string;
  model?: string | null;
  temperature?: number;
  top_p?: number;
  prompt?: string;
  mode?: string;
  permission?: PermissionConfig | null;
  scope?: AgentScope;
  disable?: boolean;
  color?: string;
  hidden?: boolean;
}

export interface AgentWithExtras {
  name: string;
  description?: string;
  model?: { providerID?: string; modelID?: string } | null;
  temperature?: number;
  topP?: number;
  prompt?: string;
  mode?: string;
  permission?: PermissionConfig | PermissionRule[];
  scope?: AgentScope;
  options?: { hidden?: boolean };
  hidden?: boolean;
  builtIn?: boolean;
  native?: boolean;
  color?: string;
}

export const isAgentBuiltIn = (agent: AgentWithExtras): boolean => {
  return agent.builtIn === true || agent.native === true;
};

export const isAgentHidden = (agent: AgentWithExtras): boolean => {
  return agent.hidden === true || agent.options?.hidden === true;
};

export const filterVisibleAgents = (agents: AgentWithExtras[]): AgentWithExtras[] =>
  agents.filter(a => !isAgentHidden(a));

interface AgentsStore {
  agents: AgentWithExtras[];
  selectedAgentName: string | null;
  isLoading: boolean;
  agentDraft: Partial<AgentConfig> | null;
  isSaving: boolean;

  setSelectedAgent: (name: string | null) => void;
  setAgentDraft: (draft: Partial<AgentConfig> | null) => void;
  loadAgents: () => Promise<boolean>;
  createAgent: (config: AgentConfig) => Promise<boolean>;
  updateAgent: (name: string, config: Partial<AgentConfig>) => Promise<boolean>;
  deleteAgent: (name: string) => Promise<boolean>;
  getAgentByName: (name: string) => AgentWithExtras | undefined;
}

function directoryParams(): string { return ''; }
function directoryHeaders(): Record<string, string> { return {}; }

export const useAgentsStore = create<AgentsStore>()((set, get) => ({
  agents: [],
  selectedAgentName: null,
  isLoading: false,
  agentDraft: null,
  isSaving: false,

  setSelectedAgent: (name) => {
    set({ selectedAgentName: name });
  },

  setAgentDraft: (draft) => {
    set({ agentDraft: draft });
  },

  loadAgents: async (retries = 3) => {
    set({ isLoading: true });
    const attempt = async (remaining: number): Promise<boolean> => {
      try {
        const resp = await fetch('/api/agent');
        if (!resp.ok) throw new Error(`Failed to load agents: ${resp.status}`);
        const data = await resp.json();
        const agentsList: AgentWithExtras[] = data?.data ?? (Array.isArray(data) ? data : []);

        const agentsWithScope = await Promise.all(
          agentsList.map(async (agent) => {
            try {
              const metaResp = await fetch(`/api/config/agents/${encodeURIComponent(agent.name)}${directoryParams()}`, {
                headers: { 'Cache-Control': 'no-cache', ...directoryHeaders() },
              });
              if (metaResp.ok) {
                const meta = await metaResp.json();
                const sources = meta.sources;
                const scope = meta.scope
                  ?? (sources?.md?.exists ? sources.md.scope : undefined)
                  ?? (sources?.json?.exists ? sources.json.scope : undefined);
                return { ...agent, scope, builtIn: meta.isBuiltIn ?? (!sources?.md?.exists && !sources?.json?.exists) };
              }
            } catch { /* ignore */ }
            return agent;
          })
        );

        set({ agents: agentsWithScope, isLoading: false });
        return true;
      } catch (error) {
        if (remaining > 0) {
          console.warn(`Failed to load agents, retrying... (${remaining} left)`, error);
          await new Promise(r => setTimeout(r, 2000));
          return attempt(remaining - 1);
        }
        console.error('Failed to load agents:', error);
        set({ isLoading: false });
        return false;
      }
    };
    return attempt(retries);
  },

  createAgent: async (config) => {
    set({ isSaving: true });
    try {
      const body: Record<string, unknown> = { mode: config.mode || 'subagent' };
      if (config.description) body.description = config.description;
      if (config.model) body.model = config.model;
      if (config.temperature !== undefined) body.temperature = config.temperature;
      if (config.top_p !== undefined) body.top_p = config.top_p;
      if (config.prompt) body.prompt = config.prompt;
      if (config.permission) body.permission = config.permission;
      if (config.disable !== undefined) body.disable = config.disable;
      if (config.scope) body.scope = config.scope;

      const resp = await fetch(`/api/config/agents/${encodeURIComponent(config.name)}${directoryParams()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...directoryHeaders() },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const payload = await resp.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to create agent');
      }

      await new Promise(r => setTimeout(r, 2000));
      await get().loadAgents();
      return true;
    } catch (error) {
      console.error('Failed to create agent:', error);
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  updateAgent: async (name, config) => {
    set({ isSaving: true });
    try {
      const body: Record<string, unknown> = {};
      if (config.mode !== undefined) body.mode = config.mode;
      if (config.description !== undefined) body.description = config.description;
      if (config.model !== undefined) body.model = config.model === null ? null : config.model;
      if (config.temperature !== undefined) body.temperature = config.temperature;
      if (config.top_p !== undefined) body.top_p = config.top_p;
      if (config.prompt !== undefined) body.prompt = config.prompt;
      if (config.permission !== undefined) body.permission = config.permission;
      if (config.disable !== undefined) body.disable = config.disable;

      const resp = await fetch(`/api/config/agents/${encodeURIComponent(name)}${directoryParams()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...directoryHeaders() },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const payload = await resp.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to update agent');
      }

      await new Promise(r => setTimeout(r, 2000));
      await get().loadAgents();
      return true;
    } catch (error) {
      console.error('Failed to update agent:', error);
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  deleteAgent: async (name) => {
    try {
      const resp = await fetch(`/api/config/agents/${encodeURIComponent(name)}${directoryParams()}`, {
        method: 'DELETE',
        headers: directoryHeaders(),
      });
      if (!resp.ok) {
        const payload = await resp.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to delete agent');
      }

      const state = get();
      if (state.selectedAgentName === name) set({ selectedAgentName: null });

      await new Promise(r => setTimeout(r, 2000));
      await get().loadAgents();
      return true;
    } catch (error) {
      console.error('Failed to delete agent:', error);
      return false;
    }
  },

  getAgentByName: (name) => {
    return get().agents.find(a => a.name === name);
  },
}));

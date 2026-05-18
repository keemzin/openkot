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
  color?: string;
}

export const isAgentBuiltIn = (agent: AgentWithExtras): boolean => {
  return agent.builtIn === true;
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
}

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

        const metaResp = await fetch('/api/config/agents/meta');
        const meta = metaResp.ok ? await metaResp.json() : {};

        const builtInNames = new Set(agentsList.map(a => a.name));

        const agentsWithExtras = agentsList.map((agent) => ({
          ...agent,
          builtIn: !meta[agent.name],
          scope: meta[agent.name]?.scope || 'user',
        }));

        const metaOnlyNames = Object.keys(meta).filter(n => !builtInNames.has(n));
        for (const name of metaOnlyNames) {
          agentsWithExtras.push({
            name,
            builtIn: false,
            scope: meta[name]?.scope || 'user',
          });
        }

        set({ agents: agentsWithExtras, isLoading: false });
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
      const resp = await fetch(`/api/config/agents/${encodeURIComponent(config.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          description: config.description,
          model: config.model && config.model !== 'null' ? config.model : undefined,
          temperature: config.temperature,
          topP: config.top_p,
          prompt: config.prompt,
          mode: config.mode,
          permission: config.permission,
          scope: config.scope || 'user',
          color: config.color,
          hidden: config.hidden,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        console.error('Create agent failed:', errText);
        return false;
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
      if (config.description !== undefined) body.description = config.description;
      if (config.model !== undefined) body.model = config.model === null ? null : config.model;
      if (config.temperature !== undefined) body.temperature = config.temperature;
      if (config.top_p !== undefined) body.topP = config.top_p;
      if (config.prompt !== undefined) body.prompt = config.prompt;
      if (config.mode !== undefined) body.mode = config.mode;
      if (config.permission !== undefined) body.permission = config.permission;
      if (config.scope !== undefined) body.scope = config.scope;
      if (config.color !== undefined) body.color = config.color;
      if (config.hidden !== undefined) body.hidden = config.hidden;

      const resp = await fetch(`/api/config/agents/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        console.error('Update agent failed:', errText);
        return false;
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
      const resp = await fetch(`/api/config/agents/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (!resp.ok) {
        const errText = await resp.text();
        console.error('Delete agent failed:', errText);
        return false;
      }

      const state = get();
      if (state.selectedAgentName === name) {
        set({ selectedAgentName: null });
      }

      await new Promise(r => setTimeout(r, 2000));
      await get().loadAgents();
      return true;
    } catch (error) {
      console.error('Failed to delete agent:', error);
      return false;
    }
  },
}));

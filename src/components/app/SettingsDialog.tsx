import { useState, useEffect, useRef } from 'react';
import type { ModelInfo } from '../../types';
import { McpForm } from './McpForm';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { getClient } from '../../lib/opencode';

interface McpServer {
  name: string;
  type: 'local' | 'remote';
  command?: string[];
  url?: string;
  enabled?: boolean;
  headers?: Record<string, string>;
  environment?: Record<string, string>;
}

interface CustomProvider {
  name: string;        // key in config
  displayName?: string; // "name" field inside
  npm?: string;        // e.g. "@ai-sdk/openai-compatible"
  baseUrl?: string;    // options.baseURL
  apiKey?: string;     // options.apiKey
  models?: string[];   // model IDs
  environment?: Record<string, string>; // environment variables
}

interface Command {
  file: string;
  name: string;
  description: string;
  agent: string;
  content: string;
}

interface SettingsDialogProps {
  onClose: () => void;
  models: ModelInfo[];
  workingDir: string;
  hiddenModelIds: Set<string>;
  onToggleModelVisibility: (modelId: string) => void;
}

// Extracted outside to prevent remounting on parent re-render
const CommandEditor = ({ command, onSave, onCancel }: { command: Command; onSave: (cmd: Command) => void; onCancel: () => void }) => {
  const [draft, setDraft] = useState<Command>(command);
  // Only reset draft when switching to a different command (tracked by file path)
  const prevFileRef = useRef(command.file);
  useEffect(() => {
    if (command.file !== prevFileRef.current) {
      setDraft(command);
      prevFileRef.current = command.file;
    }
  }, [command.file]);

  return (
    <div style={{ padding: 12, background: 'var(--bg-2)', borderRadius: 6, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Edit Command</h4>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Name</label>
          <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Command name"
            style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Agent</label>
          <select value={draft.agent} onChange={e => setDraft({ ...draft, agent: e.target.value })}
            style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
            <option value="build">build</option>
            <option value="plan">plan</option>
          </select>
        </div>
      </div>
      <div>
        <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Description</label>
        <input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Brief description"
          style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
      </div>
      <div>
        <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Content (Markdown)</label>
        <textarea value={draft.content} onChange={e => setDraft({ ...draft, content: e.target.value })} placeholder="Command implementation in Markdown"
          rows={16} style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, resize: 'vertical', fontFamily: 'monospace', minHeight: 200 }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onSave(draft)} style={{ padding: '5px 10px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 12 }}>Save</button>
        <button onClick={onCancel} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  );
};

export function SettingsDialog({ onClose, models, workingDir, hiddenModelIds, onToggleModelVisibility }: SettingsDialogProps) {
  const [selectedPage, setSelectedPage] = useState<'mcp' | 'models' | 'providers' | 'commands' | 'appearance'>('mcp');
  const [configScope, setConfigScope] = useState<'global' | 'local'>('global');
  const { streamingMode, setStreamingMode } = usePreferencesStore();
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMcp, setEditingMcp] = useState<McpServer | null>(null);
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [restartStatus, setRestartStatus] = useState<'idle' | 'restarting' | 'done' | 'error'>('idle');
  const [restartError, setRestartError] = useState<string | null>(null);

  // MCP runtime status: name → { status, error? }
  type McpRuntimeStatus = { status: 'connected' | 'failed' | 'disabled' | 'needs_auth' | string; error?: string };
  const [mcpStatus, setMcpStatus] = useState<Record<string, McpRuntimeStatus>>({});
  const [mcpActionLoading, setMcpActionLoading] = useState<Record<string, string>>({}); // name → 'connecting'|'disconnecting'|'testing'

  // Models tab state
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [editingProvider, setEditingProvider] = useState<CustomProvider | null>(null);
  const [editProviderModelInput, setEditProviderModelInput] = useState('');
  const [editProviderEnvInput, setEditProviderEnvInput] = useState('');
  const [newProvider, setNewProvider] = useState<CustomProvider>({ name: '', displayName: '', npm: '@ai-sdk/openai-compatible', baseUrl: '', apiKey: '', models: [], environment: {} });
  const [newModelInput, setNewModelInput] = useState('');
  const [newEnvInput, setNewEnvInput] = useState('');
  const [providerLoading, setProviderLoading] = useState(false);

   // Providers SDK tab state - uses OpenCode SDK directly
   interface ProviderAuthMethod {
     type: 'oauth' | 'api';
     label: string;
     prompts?: Array<{
       type: 'text' | 'select';
       key: string;
       message: string;
       placeholder?: string;
       options?: Array<{ label: string; value: string; hint?: string }>;
       when?: { key: string; op: 'eq' | 'neq'; value: string };
     }>;
   }
   interface ProviderInfo {
     id: string;
     name: string;
     displayName?: string;
     connected: boolean;
     source?: string;
     env?: string[];
     authMethods?: ProviderAuthMethod[];
     models?: Record<string, { id: string; name: string }>;
     defaultModel?: string;
   }
  const [sdkProviders, setSdkProviders] = useState<ProviderInfo[]>([]);
  const [sdkProvidersLoading, setSdkProvidersLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [authMethod, setAuthMethod] = useState<ProviderAuthMethod | null>(null);
  const [authMethodIndex, setAuthMethodIndex] = useState(0);
  const [authValues, setAuthValues] = useState<Record<string, string>>({});
  const [providerActionLoading, setProviderActionLoading] = useState<Record<string, string>>({}); // id → 'connecting'|'disconnecting'

  // Commands tab state
  const [commands, setCommands] = useState<Command[]>([]);
  const [showAddCommand, setShowAddCommand] = useState(false);
  const [editingCommand, setEditingCommand] = useState<Command | null>(null);
  const [newCommand, setNewCommand] = useState<Command>({ file: '', name: '', description: '', agent: 'build', content: '' });
  const [commandLoading, setCommandLoading] = useState(false);
  const [editingCommandDraft, setEditingCommandDraft] = useState<Command | null>(null);

   // Load config via SDK
   useEffect(() => {
     if (!workingDir) {
       setLoading(false);
       setProviderLoading(false);
       setCommandLoading(false);
       return;
     }

     const loadConfig = async () => {
       try {
         // Load MCP config via Express (reads from opencode.jsonc on disk)
         const mcpResp = await fetch(`/api/config/mcp?scope=${configScope}`);
         if (mcpResp.ok) {
           const mcpData = await mcpResp.json();
           if (Array.isArray(mcpData)) {
             const servers = mcpData.map((cfg: any): McpServer => ({
               ...cfg,
               enabled: cfg.enabled !== false, // default to true
             }));
             setMcpServers(servers);
             console.log('Loaded MCP servers:', servers.map((s: McpServer) => `${s.name}: enabled=${s.enabled}`));
           }
         }
       } catch (e) {
         console.error('Failed to load MCP config:', e);
       }
       setLoading(false);

       // Load custom providers via Express (reads from opencode.jsonc on disk)
       try {
         const provResp = await fetch(`/api/config/providers/custom?scope=${configScope}`);
         if (provResp.ok) {
           const provData = await provResp.json();
           if (Array.isArray(provData)) setCustomProviders(provData);
         }
       } catch (e) {
         console.error('Failed to load providers:', e);
       }
       setProviderLoading(false);

       // Load commands via Express (no SDK equivalent)
       try {
         const r = await fetch('/api/config/commands');
         if (r.ok) {
           const data = await r.json();
           if (Array.isArray(data)) setCommands(data);
         }
       } catch (e) {
         console.error('Failed to load commands:', e);
       }
       setCommandLoading(false);
     };

     loadConfig();
   }, [workingDir, configScope]);

  // Load providers via OpenCode SDK - reload when tab is selected
   useEffect(() => {
     if (!workingDir || selectedPage !== 'providers') {
       return;
     }

     const loadSdkProviders = async () => {
       setSdkProvidersLoading(true);
       try {
         const client = await getClient();
         console.log('[SDK] Loading providers for dir:', workingDir);

         // GET /provider → { all: Provider[], connected: string[], default: {} }
         const providersResp = await client.provider.list({ directory: workingDir });
         const providersData = (providersResp as any)?.data ?? providersResp;
         console.log('[SDK] Providers raw:', providersData);

         // GET /provider/auth → { [providerID]: ProviderAuthMethod[] }
         const authResp = await client.provider.auth({ directory: workingDir });
         const authData = (authResp as any)?.data ?? authResp;
         console.log('[SDK] Auth methods raw:', authData);

         const providersList: any[] = providersData?.all ?? [];
         const connectedIds: string[] = providersData?.connected ?? [];
         const defaultModels: Record<string, string> = providersData?.default ?? {};

         // Transform to our format
         const transformed: ProviderInfo[] = providersList.map((prov: any) => ({
           id: prov.id,
           name: prov.name || prov.id,
           displayName: prov.name || prov.id,
           connected: connectedIds.includes(prov.id),
           source: prov.source,
           env: prov.env ?? [],
           authMethods: authData?.[prov.id] ?? [],
           models: prov.models ?? {},
           defaultModel: defaultModels[prov.id],
         }));

         // Sort: connected first, then alphabetically
         transformed.sort((a, b) => {
           if (a.connected !== b.connected) return a.connected ? -1 : 1;
           return a.name.localeCompare(b.name);
         });

         console.log('[SDK] Transformed providers:', transformed);
         setSdkProviders(transformed);
       } catch (e: any) {
         console.error('[SDK] Failed to load providers:', e?.message || e);
         setSdkProviders([]);
       } finally {
         setSdkProvidersLoading(false);
       }
     };

     loadSdkProviders();
   }, [workingDir, selectedPage]);

  // Fetch MCP runtime status from OpenCode
  const refreshMcpStatus = async () => {
    try {
      const r = await fetch('/api/mcp/status');
      if (!r.ok) return;
      const data = await r.json();
      if (data && typeof data === 'object') setMcpStatus(data);
    } catch {}
  };

  useEffect(() => {
    refreshMcpStatus();
    const interval = setInterval(refreshMcpStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleMcpConnect = async (name: string) => {
    setMcpActionLoading(prev => ({ ...prev, [name]: 'connecting' }));
    try {
      await fetch(`/api/mcp/${name}/connect`, { method: 'POST' });
      await refreshMcpStatus();
    } catch {}
    setMcpActionLoading(prev => { const n = { ...prev }; delete n[name]; return n; });
  };

  const handleMcpDisconnect = async (name: string) => {
    setMcpActionLoading(prev => ({ ...prev, [name]: 'disconnecting' }));
    try {
      await fetch(`/api/mcp/${name}/disconnect`, { method: 'POST' });
      await refreshMcpStatus();
    } catch {}
    setMcpActionLoading(prev => { const n = { ...prev }; delete n[name]; return n; });
  };

  const handleMcpTest = async (name: string) => {
    setMcpActionLoading(prev => ({ ...prev, [name]: 'testing' }));
    const wasConnected = mcpStatus[name]?.status === 'connected';
    try {
      await fetch(`/api/mcp/${name}/connect`, { method: 'POST' });
      await refreshMcpStatus();
      // If it wasn't connected before, disconnect after test (non-destructive test)
      if (!wasConnected) {
        await fetch(`/api/mcp/${name}/disconnect`, { method: 'POST' });
        await refreshMcpStatus();
      }
    } catch {}
    setMcpActionLoading(prev => { const n = { ...prev }; delete n[name]; return n; });
  };

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleMcp = (name: string) => {
    setMcpServers(prev => prev.map(s => s.name === name ? { ...s, enabled: !s.enabled } : s));
  };

  const addMcp = (server: McpServer) => {
    setMcpServers(prev => [...prev, server]);
    setShowAddMcp(false);
  };

  const updateMcp = (name: string, updates: Partial<McpServer>) => {
    setMcpServers(prev => prev.map(s => s.name === name ? { ...s, ...updates } : s));
    setEditingMcp(null);
  };

  const deleteMcp = async (name: string) => {
    try {
      await fetch(`/api/config/mcp/${encodeURIComponent(name)}?scope=${configScope}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to delete MCP server:', e);
    }
    setMcpServers(prev => prev.filter(s => s.name !== name));
  };

  const fetchModelsFromProvider = async (baseUrl: string, apiKey?: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const url = new URL('/v1/models', baseUrl).href;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('Failed to fetch models');
      const data = await res.json();
      const models = data.data?.map((m: any) => m.id) || [];
      return models;
    } catch (e) {
      console.error('Error fetching models:', e);
      return [];
    }
  };

  const saveCustomProvider = async (provider: CustomProvider) => {
    if (!workingDir) return;

    try {
      // Save via Express (writes to opencode.jsonc on disk)
      const resp = await fetch(`/api/config/providers/custom/${encodeURIComponent(provider.name)}?scope=${configScope}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(provider),
      });
      if (!resp.ok) throw new Error(await resp.text());

      setCustomProviders(prev => {
        const idx = prev.findIndex(p => p.name === provider.name);
        if (idx >= 0) { const next = [...prev]; next[idx] = provider; return next; }
        return [...prev, provider];
      });
      setShowAddProvider(false);
      setEditingProvider(null);
      setNewProvider({ name: '', displayName: '', npm: '@ai-sdk/openai-compatible', baseUrl: '', apiKey: '', models: [], environment: {} });
      setNewModelInput('');
      setNewEnvInput('');

      // Restart OpenCode so the new provider is available
      await fetch('/restart', { method: 'POST' });
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const res = await fetch('/health');
          if (res.ok) {
            const data = await res.json();
            if (data.isOpenCodeReady) break;
          }
        } catch {}
      }
      window.location.reload();
    } catch (e) {
      console.error('Failed to save provider:', e);
    }
  };

  const deleteCustomProvider = async (name: string) => {
    if (!workingDir) return;

    try {
      // Delete via Express (writes to opencode.jsonc on disk)
      await fetch(`/api/config/providers/custom/${encodeURIComponent(name)}?scope=${configScope}`, { method: 'DELETE' });
      setCustomProviders(prev => prev.filter(p => p.name !== name));
    } catch (e) {
      console.error('Failed to delete provider:', e);
    }
  };

  const saveCommand = async (command: Command) => {
    const file = command.file || `${command.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    await fetch(`/api/config/commands/${encodeURIComponent(file)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    setCommands(prev => {
      const idx = prev.findIndex(c => c.file === file);
      const updated = { ...command, file };
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
      return [...prev, updated];
    });
    setShowAddCommand(false);
    setEditingCommand(null);
    setNewCommand({ file: '', name: '', description: '', agent: 'build', content: '' });
  };

  const deleteCommand = async (file: string) => {
    await fetch(`/api/config/commands/${encodeURIComponent(file)}`, { method: 'DELETE' });
    setCommands(prev => prev.filter(c => c.file !== file));
  };

  // Save all MCP config via SDK - merge with existing config
  const saveSettings = async () => {
    if (!workingDir) {
      console.error('No working directory');
      onClose();
      return;
    }

    try {
      // Save each MCP server via Express routes (writes to opencode.jsonc on disk)
      for (const server of mcpServers) {
        const { name, ...rest } = server;
        const enabled = rest.enabled !== false;
        const payload = { ...rest, enabled };
        console.log('Saving MCP:', name, 'enabled:', enabled);

        await fetch(`/api/config/mcp/${encodeURIComponent(name)}?scope=${configScope}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      console.log('MCP config saved via Express');
    } catch (e) {
      console.error('Failed to save MCP config:', e);
    }

    onClose();
  };

  return (
    <>
      <div
        className="settings-overlay"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300 }}
      />
      <div className="settings-panel" style={{
        position: 'fixed', top: isMobile ? 0 : '50%', left: isMobile ? 0 : '50%', transform: isMobile ? 'none' : 'translate(-50%, -50%)',
        width: isMobile ? '100%' : 800, height: isMobile ? '100%' : 600, background: 'var(--bg)', border: isMobile ? 'none' : '1px solid var(--border)',
        borderRadius: isMobile ? 0 : 8, zIndex: 301, display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Settings</h2>
            {/* Global / Local scope toggle */}
            <div style={{ display: 'flex', background: 'var(--bg-2)', borderRadius: 6, padding: 2, gap: 1 }}>
              {(['global', 'local'] as const).map(scope => (
                <button
                  key={scope}
                  onClick={() => setConfigScope(scope)}
                  style={{
                    padding: '3px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
                    background: configScope === scope ? 'var(--bg-4)' : 'transparent',
                    color: configScope === scope ? 'var(--text)' : 'var(--text-4)',
                    fontFamily: 'inherit', textTransform: 'capitalize',
                  }}
                >
                  {scope}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
              {configScope === 'global' ? '~/.opencode/opencode.jsonc' : `${workingDir}/.opencode/opencode.jsonc`}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: isMobile ? 'auto' : 'hidden' }}>
          <div style={{
            width: isMobile ? 'auto' : 200,
            borderRight: isMobile ? 'none' : '1px solid var(--border)',
            borderBottom: isMobile ? '1px solid var(--border)' : 'none',
            padding: isMobile ? '12px 16px' : '16px 0',
            overflowX: isMobile ? 'auto' : 'hidden',
            overflowY: isMobile ? 'hidden' : 'auto',
            display: 'flex',
            flexDirection: isMobile ? 'row' : 'column',
            flexShrink: 0
          }}>
            <button onClick={() => setSelectedPage('mcp')} style={{
              width: isMobile ? 'auto' : '100%',
              padding: isMobile ? '8px 12px' : '8px 16px',
              background: selectedPage === 'mcp' ? 'var(--bg-2)' : 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: 14,
              cursor: 'pointer',
              textAlign: 'left',
              borderLeft: !isMobile && selectedPage === 'mcp' ? '2px solid var(--accent)' : 'none',
              borderBottom: isMobile && selectedPage === 'mcp' ? '2px solid var(--accent)' : 'none'
            }}>MCP</button>
            <button onClick={() => setSelectedPage('models')} style={{
              width: isMobile ? 'auto' : '100%',
              padding: isMobile ? '8px 12px' : '8px 16px',
              background: selectedPage === 'models' ? 'var(--bg-2)' : 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: 14,
              cursor: 'pointer',
              textAlign: 'left',
              borderLeft: !isMobile && selectedPage === 'models' ? '2px solid var(--accent)' : 'none',
              borderBottom: isMobile && selectedPage === 'models' ? '2px solid var(--accent)' : 'none'
            }}>Models</button>
            <button onClick={() => setSelectedPage('providers')} style={{
              width: isMobile ? 'auto' : '100%',
              padding: isMobile ? '8px 12px' : '8px 16px',
              background: selectedPage === 'providers' ? 'var(--bg-2)' : 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: 14,
              cursor: 'pointer',
              textAlign: 'left',
              borderLeft: !isMobile && selectedPage === 'providers' ? '2px solid var(--accent)' : 'none',
              borderBottom: isMobile && selectedPage === 'providers' ? '2px solid var(--accent)' : 'none'
            }}>Providers</button>
            <button onClick={() => setSelectedPage('commands')} style={{
              width: isMobile ? 'auto' : '100%',
              padding: isMobile ? '8px 12px' : '8px 16px',
              background: selectedPage === 'commands' ? 'var(--bg-2)' : 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: 14,
              cursor: 'pointer',
              textAlign: 'left',
              borderLeft: !isMobile && selectedPage === 'commands' ? '2px solid var(--accent)' : 'none',
              borderBottom: isMobile && selectedPage === 'commands' ? '2px solid var(--accent)' : 'none'
            }}>Commands</button>
            <button onClick={() => setSelectedPage('appearance')} style={{
              width: isMobile ? 'auto' : '100%',
              padding: isMobile ? '8px 12px' : '8px 16px',
              background: selectedPage === 'appearance' ? 'var(--bg-2)' : 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: 14,
              cursor: 'pointer',
              textAlign: 'left',
              borderLeft: !isMobile && selectedPage === 'appearance' ? '2px solid var(--accent)' : 'none',
              borderBottom: isMobile && selectedPage === 'appearance' ? '2px solid var(--accent)' : 'none'
            }}>Appearance</button>
          </div>
          <div style={{ flex: 1, padding: isMobile ? '16px' : '20px', overflowY: 'auto' }}>
            {selectedPage === 'mcp' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>MCP Servers</h3>
                  <button onClick={() => setShowAddMcp(true)} style={{ padding: '4px 8px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 12 }}>Add</button>
                </div>
                {showAddMcp && <McpForm onSave={addMcp} onCancel={() => setShowAddMcp(false)} />}
                {loading ? (
                  <div style={{ fontSize: 14, color: 'var(--text-3)' }}>Loading...</div>
                ) : mcpServers.length === 0 ? (
                  <div style={{ fontSize: 14, color: 'var(--text-3)' }}>No MCP servers configured.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {mcpServers.map(server => {
                      const runtime = mcpStatus[server.name];
                      const actionLoading = mcpActionLoading[server.name];
                      const isConnected = runtime?.status === 'connected';
                      const isFailed = runtime?.status === 'failed';
                      const configDisabled = server.enabled === false;

                      // Separate config status from runtime status
                      // config disabled = red checkbox, runtime connected = green status
                      const statusDot = isConnected
                        ? { color: 'var(--green)', label: 'Connected' }
                        : isFailed
                        ? { color: 'var(--red)', label: 'Failed' }
                        : runtime?.status && runtime.status !== 'disabled'
                        ? { color: 'var(--orange)', label: runtime.status }
                        : configDisabled
                        ? { color: 'var(--text-4)', label: 'Disabled' }
                        : { color: 'var(--orange)', label: 'Stopped' };

                      return (
                        <div key={server.name} style={{ borderRadius: 4, border: '1px solid var(--border)', overflow: 'hidden' }}>
                          {/* Inline edit form — replaces card content when editing */}
                          {editingMcp?.name === server.name ? (
                            <McpForm
                              initial={editingMcp}
                              onSave={(updates) => updateMcp(editingMcp.name, updates)}
                              onCancel={() => setEditingMcp(null)}
                            />
                          ) : (
                            <div style={{ padding: '12px', background: 'var(--bg-2)' }}>
                              {/* Header row */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <input type="checkbox" checked={server.enabled !== false} onChange={() => toggleMcp(server.name)} style={{ accentColor: 'var(--accent)', flexShrink: 0 }} />
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{server.name}</span>
                                {/* Status badge */}
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: statusDot.color, background: `${statusDot.color}18`, padding: '2px 7px', borderRadius: 10, border: `1px solid ${statusDot.color}40` }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusDot.color, display: 'inline-block', flexShrink: 0 }} />
                                  {statusDot.label}
                                </span>
                                <div style={{ flex: 1 }} />
                                <button onClick={() => setEditingMcp(server)} style={{ padding: '3px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-3)', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                                <button onClick={() => deleteMcp(server.name)} style={{ padding: '3px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-3)', cursor: 'pointer', fontSize: 11 }}>Delete</button>
                              </div>

                              {/* Info row */}
                              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, fontFamily: 'monospace' }}>
                                {server.type === 'remote' ? server.url : server.command?.join(' ') || 'N/A'}
                              </div>

                              {/* Error message */}
                              {isFailed && runtime?.error && (
                                <div style={{ fontSize: 11, color: 'var(--red)', background: 'rgba(255,85,85,0.08)', padding: '4px 8px', borderRadius: 3, marginBottom: 8, fontFamily: 'monospace' }}>
                                  {runtime.error}
                                </div>
                              )}

                              {/* Action buttons */}
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  disabled={!!actionLoading || !server.enabled}
                                  onClick={() => isConnected ? handleMcpDisconnect(server.name) : handleMcpConnect(server.name)}
                                  style={{
                                    padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: actionLoading || !server.enabled ? 'not-allowed' : 'pointer',
                                    border: '1px solid var(--border)', background: 'transparent',
                                    color: actionLoading === 'connecting' || actionLoading === 'disconnecting' ? 'var(--text-4)' : isConnected ? 'var(--red)' : 'var(--accent)',
                                    opacity: !server.enabled ? 0.5 : 1,
                                  }}
                                >
                                  {actionLoading === 'connecting' ? 'Connecting…' : actionLoading === 'disconnecting' ? 'Disconnecting…' : isConnected ? 'Disconnect' : 'Connect'}
                                </button>
                                <button
                                  disabled={!!actionLoading || !server.enabled}
                                  onClick={() => handleMcpTest(server.name)}
                                  style={{
                                    padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: actionLoading || !server.enabled ? 'not-allowed' : 'pointer',
                                    border: '1px solid var(--border)', background: 'transparent',
                                    color: actionLoading === 'testing' ? 'var(--text-4)' : 'var(--text-3)',
                                    opacity: !server.enabled ? 0.5 : 1,
                                  }}
                                >
                                  {actionLoading === 'testing' ? 'Testing…' : 'Test'}
                                </button>
                                <button
                                  disabled={!!actionLoading}
                                  onClick={refreshMcpStatus}
                                  style={{ padding: '3px 8px', fontSize: 11, borderRadius: 3, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-4)' }}
                                  title="Refresh status"
                                >↻</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {selectedPage === 'models' && (
              <div>
                {/* Connected models */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Connected Models</h3>
                    {models.length > 0 && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => {
                            // Show all — clear all hidden
                            models.forEach(m => { if (hiddenModelIds.has(m.id)) onToggleModelVisibility(m.id); });
                          }}
                          style={{ padding: '3px 8px', fontSize: 11, background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-3)', cursor: 'pointer' }}
                        >Show all</button>
                        <button
                          onClick={() => {
                            // Hide all — hide every visible model
                            models.forEach(m => { if (!hiddenModelIds.has(m.id)) onToggleModelVisibility(m.id); });
                          }}
                          style={{ padding: '3px 8px', fontSize: 11, background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-3)', cursor: 'pointer' }}
                        >Hide all</button>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>Toggle models to show or hide them in the model selector.</div>
                  {models.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No models connected. Use <code>/connect</code> in chat to add a provider.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {(() => {
                        // Group by provider
                        const grouped = models.reduce<Record<string, { providerName: string; models: typeof models }>>((acc, m) => {
                          if (!acc[m.providerId]) acc[m.providerId] = { providerName: m.providerName, models: [] };
                          acc[m.providerId].models.push(m);
                          return acc;
                        }, {});

                        return Object.entries(grouped).map(([providerId, group]) => {
                          const allHidden = group.models.every(m => hiddenModelIds.has(m.id));

                          return (
                            <div key={providerId}>
                              {/* Provider group header */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', marginBottom: 4, borderBottom: '1px solid var(--border)' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  {group.providerName}
                                </span>
                                <button
                                  onClick={() => {
                                    if (allHidden) {
                                      // Show all in group
                                      group.models.forEach(m => { if (hiddenModelIds.has(m.id)) onToggleModelVisibility(m.id); });
                                    } else {
                                      // Hide all in group
                                      group.models.forEach(m => { if (!hiddenModelIds.has(m.id)) onToggleModelVisibility(m.id); });
                                    }
                                  }}
                                  style={{ padding: '2px 7px', fontSize: 10, background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-4)', cursor: 'pointer' }}
                                >
                                  {allHidden ? 'Show all' : 'Hide all'}
                                </button>
                              </div>

                              {/* Models in group */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {group.models.map(m => {
                                  const hidden = hiddenModelIds.has(m.id);
                                  return (
                                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-2)', borderRadius: 4, opacity: hidden ? 0.4 : 1 }}>
                                      <input
                                        type="checkbox"
                                        checked={!hidden}
                                        onChange={() => onToggleModelVisibility(m.id)}
                                        style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                                      />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                                      </div>
                                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                        {m.isFree && <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid rgba(237,180,73,0.3)', padding: '1px 6px', borderRadius: 4 }}>Free</span>}
                                        {m.isDefault && <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--border)', border: '1px solid var(--border-2)', padding: '1px 6px', borderRadius: 4 }}>Default</span>}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>

                {/* Custom providers */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Custom Providers</h3>
                    <button onClick={() => setShowAddProvider(true)} style={{ padding: '4px 8px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 12 }}>Add</button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
                    Add OpenAI-compatible providers (Ollama, LM Studio, custom endpoints).
                  </div>

                  {showAddProvider && (
                    <div style={{ padding: 12, background: 'var(--bg-2)', borderRadius: 6, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Add Custom Provider</h4>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Provider ID (key)</label>
                          <input value={newProvider.name} onChange={e => setNewProvider(p => ({ ...p, name: e.target.value }))}
                            placeholder="e.g., my-ollama"
                            style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Display Name</label>
                          <input value={newProvider.displayName} onChange={e => setNewProvider(p => ({ ...p, displayName: e.target.value }))}
                            placeholder="e.g., My Ollama"
                            style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>npm package</label>
                        <input value={newProvider.npm} onChange={e => setNewProvider(p => ({ ...p, npm: e.target.value }))}
                          placeholder="@ai-sdk/openai-compatible"
                          style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, fontFamily: 'monospace' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Base URL</label>
                        <input value={newProvider.baseUrl} onChange={e => setNewProvider(p => ({ ...p, baseUrl: e.target.value }))}
                          placeholder="e.g., http://localhost:11434/v1"
                          style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>API Key (optional)</label>
                        <input value={newProvider.apiKey} onChange={e => setNewProvider(p => ({ ...p, apiKey: e.target.value }))}
                          placeholder="Leave empty for local providers"
                          type="password"
                          style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                      </div>
                       <div>
                         <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Environment Variables (KEY=VALUE, one per line)</label>
                         <textarea value={newEnvInput} onChange={e => setNewEnvInput(e.target.value)}
                           placeholder="API_KEY=your-key&#10;DEBUG=true"
                           rows={2}
                           style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, resize: 'vertical', fontFamily: 'monospace' }} />
                       </div>
                       <div>
                         <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Models (one per line or comma-separated)</label>
                         <textarea value={newModelInput} onChange={e => setNewModelInput(e.target.value)}
                           placeholder="gemini-2.5-flash&#10;llama3.2&#10;mistral"
                           rows={3}
                           style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, resize: 'vertical', fontFamily: 'monospace' }} />
                         <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                           <button
                             onClick={async () => {
                               if (!newProvider.baseUrl) return;
                               const models = await fetchModelsFromProvider(newProvider.baseUrl, newProvider.apiKey);
                               setNewModelInput(models.join('\n'));
                             }}
                             disabled={!newProvider.baseUrl}
                             style={{ padding: '3px 8px', background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 3, color: 'var(--text-2)', cursor: 'pointer', fontSize: 11 }}>Fetch from /v1/models</button>
                           <div style={{ fontSize: 10, color: 'var(--text-4)' }}>Fetch available models from the provider</div>
                         </div>
                       </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => {
                            const modelList = newModelInput.split(/[\n,]/).map(m => m.trim()).filter(Boolean);
                            const envObj: Record<string, string> = {};
                            newEnvInput.split('\n').forEach(line => {
                              const [key, ...vals] = line.split('=');
                              if (key && vals.length) envObj[key.trim()] = vals.join('=').trim();
                            });
                            saveCustomProvider({ ...newProvider, models: modelList, environment: envObj });
                          }}
                          disabled={!newProvider.name.trim() || !newProvider.baseUrl?.trim()}
                          style={{ padding: '5px 10px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 12 }}>Save</button>
                        <button onClick={() => { setShowAddProvider(false); setNewProvider({ name: '', displayName: '', npm: '@ai-sdk/openai-compatible', baseUrl: '', apiKey: '', models: [], environment: {} }); setNewModelInput(''); setNewEnvInput(''); }}
                          style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {providerLoading ? (
                    <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading...</div>
                  ) : customProviders.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No custom providers configured.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {customProviders.map(p => (
                        <div key={p.name} style={{ borderRadius: 4, border: '1px solid var(--border)', overflow: 'hidden' }}>
                          {editingProvider?.name === p.name ? (
                            /* Inline edit form */
                            <div style={{ padding: 12, background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Edit Provider: {p.name}</h4>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Display Name</label>
                                  <input value={editingProvider.displayName} onChange={e => setEditingProvider(ep => ep ? { ...ep, displayName: e.target.value } : ep)}
                                    style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                                </div>
                              </div>
                              <div>
                                <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Base URL</label>
                                <input value={editingProvider.baseUrl} onChange={e => setEditingProvider(ep => ep ? { ...ep, baseUrl: e.target.value } : ep)}
                                  style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>API Key (optional)</label>
                                <input value={editingProvider.apiKey} onChange={e => setEditingProvider(ep => ep ? { ...ep, apiKey: e.target.value } : ep)}
                                  type="password" placeholder="Leave empty for local providers"
                                  style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Environment Variables (KEY=VALUE, one per line)</label>
                                <textarea value={editProviderEnvInput} onChange={e => setEditProviderEnvInput(e.target.value)}
                                  rows={2} style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, resize: 'vertical', fontFamily: 'monospace' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>Models (one per line)</label>
                                <textarea value={editProviderModelInput} onChange={e => setEditProviderModelInput(e.target.value)}
                                  rows={3} style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, resize: 'vertical', fontFamily: 'monospace' }} />
                                <button onClick={async () => {
                                  if (!editingProvider.baseUrl) return;
                                  const fetched = await fetchModelsFromProvider(editingProvider.baseUrl, editingProvider.apiKey);
                                  setEditProviderModelInput(fetched.join('\n'));
                                }} disabled={!editingProvider.baseUrl}
                                  style={{ marginTop: 4, padding: '3px 8px', background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 3, color: 'var(--text-2)', cursor: 'pointer', fontSize: 11 }}>Fetch from /v1/models</button>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => {
                                  const modelList = editProviderModelInput.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
                                  const envObj: Record<string, string> = {};
                                  editProviderEnvInput.split('\n').forEach(line => { const [k, ...v] = line.split('='); if (k?.trim()) envObj[k.trim()] = v.join('=').trim(); });
                                  saveCustomProvider({ ...editingProvider, models: modelList, environment: envObj });
                                }} style={{ padding: '5px 10px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 12 }}>Save</button>
                                <button onClick={() => setEditingProvider(null)} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            /* Normal card view */
                            <div style={{ padding: '10px 12px', background: 'var(--bg-2)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{p.name}</span>
                                <button onClick={() => {
                                  setEditingProvider({ ...p });
                                  setEditProviderModelInput((p.models ?? []).join('\n'));
                                  setEditProviderEnvInput(Object.entries(p.environment ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'));
                                }} style={{ padding: '3px 8px', background: 'var(--accent)', border: 'none', borderRadius: 3, color: 'white', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                                <button onClick={() => deleteCustomProvider(p.name)} style={{ padding: '3px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-3)', cursor: 'pointer', fontSize: 11 }}>Remove</button>
                              </div>
                              {p.baseUrl && <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 2 }}>{p.baseUrl}</div>}
                              {p.environment && Object.keys(p.environment).length > 0 && (
                                <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 2 }}>
                                  Env: {Object.entries(p.environment).map(([k, v]) => `${k}=${v}`).join(', ')}
                                </div>
                              )}
                              {p.models && p.models.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                  {p.models.map(m => (
                                    <span key={m} style={{ fontSize: 10, padding: '1px 6px', background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 3, color: 'var(--text-3)' }}>{m}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
               </div>
             )}

             {selectedPage === 'providers' && (
               <div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                   <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>AI Providers (SDK)</h3>
                   <button onClick={async () => {
                     if (!workingDir) return;
                     setSdkProvidersLoading(true);
                     try {
                       const client = await getClient();
                       const providersResp = await client.provider.list({ directory: workingDir });
                       const providersData = (providersResp as any)?.data ?? providersResp;
                       const authResp = await client.provider.auth({ directory: workingDir });
                       const authData = (authResp as any)?.data ?? authResp;
                       const providersList: any[] = providersData?.all ?? [];
                       const connectedIds: string[] = providersData?.connected ?? [];
                       const defaultModels: Record<string, string> = providersData?.default ?? {};
                       const transformed: ProviderInfo[] = providersList.map((prov: any) => ({
                         id: prov.id,
                         name: prov.name || prov.id,
                         displayName: prov.name || prov.id,
                         connected: connectedIds.includes(prov.id),
                         source: prov.source,
                         env: prov.env ?? [],
                         authMethods: authData?.[prov.id] ?? [],
                         models: prov.models ?? {},
                         defaultModel: defaultModels[prov.id],
                       }));
                       transformed.sort((a, b) => {
                         if (a.connected !== b.connected) return a.connected ? -1 : 1;
                         return a.name.localeCompare(b.name);
                       });
                       setSdkProviders(transformed);
                     } catch (e) {
                       console.error('[SDK] Refresh failed:', e);
                     } finally {
                       setSdkProvidersLoading(false);
                     }
                   }} style={{ padding: '4px 8px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>Refresh</button>
                 </div>
                 <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                   Manage AI providers via the OpenCode SDK. Connected providers are shown first.
                 </div>

                 {sdkProvidersLoading ? (
                   <div style={{ fontSize: 14, color: 'var(--text-3)' }}>Loading providers from OpenCode...</div>
                 ) : sdkProviders.length === 0 ? (
                   <div style={{ fontSize: 14, color: 'var(--text-3)' }}>No providers available. Start OpenCode to load providers.</div>
                 ) : (
                   <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                     {sdkProviders.map(prov => {
                       const modelCount = Object.keys(prov.models ?? {}).length;
                       const actionLoading = providerActionLoading[prov.id];
                       const hasApiAuth = prov.authMethods?.some(m => m.type === 'api');
                       const hasOauthAuth = prov.authMethods?.some(m => m.type === 'oauth');
                       // env/config = connected via env var or config file — auth.remove won't stick
                       const canDisconnect = prov.connected && prov.source === 'api';
                       const envConnected = prov.connected && (prov.source === 'env' || prov.source === 'config');

                       const openConnectModal = () => {
                         setSelectedProvider(prov);
                         const firstMethod = prov.authMethods?.[0] ?? {
                           type: 'api' as const,
                           label: 'API Key',
                           prompts: [{
                             type: 'text' as const,
                             key: 'key',
                             message: prov.env?.[0] ? `${prov.env[0]}` : 'API Key',
                             placeholder: 'sk-...',
                           }],
                         };
                         setAuthMethod(firstMethod);
                         setAuthMethodIndex(0);
                         setAuthValues({});
                         setShowAuthForm(true);
                       };

                       const doDisconnect = async () => {
                         setProviderActionLoading(prev => ({ ...prev, [prov.id]: 'disconnecting' }));
                         try {
                           const client = await getClient();
                           await client.auth.remove({ providerID: prov.id });
                           // Re-fetch from SDK to get true state (env vars may keep it connected)
                           const resp = await client.provider.list({ directory: workingDir });
                           const data = (resp as any)?.data ?? resp;
                           const connectedIds: string[] = data?.connected ?? [];
                           setSdkProviders(prev => {
                             const updated = prev.map(p => ({
                               ...p,
                               connected: connectedIds.includes(p.id),
                             }));
                             return [...updated].sort((a, b) => {
                               if (a.connected !== b.connected) return a.connected ? -1 : 1;
                               return a.name.localeCompare(b.name);
                             });
                           });
                         } catch (e: any) {
                           console.error('[SDK] Disconnect failed:', e);
                           alert(`Disconnect failed: ${e?.message || 'Unknown error'}`);
                         } finally {
                           setProviderActionLoading(prev => { const n = { ...prev }; delete n[prov.id]; return n; });
                         }
                       };

                       return (
                         <div key={prov.id} style={{ borderRadius: 4, border: `1px solid ${prov.connected ? 'var(--accent)' : 'var(--border)'}`, overflow: 'hidden' }}>
                           <div style={{ padding: '12px', background: prov.connected ? 'var(--bg-2)' : 'var(--bg)' }}>
                             {/* Header */}
                             <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                               <span style={{
                                 width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                 background: prov.connected ? 'var(--green)' : 'var(--text-4)',
                               }} />
                               <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', flex: 1 }}>
                                 {prov.displayName || prov.name}
                               </span>
                               <span style={{
                                 fontSize: 11, padding: '2px 7px', borderRadius: 10,
                                 color: prov.connected ? 'var(--green)' : 'var(--text-4)',
                                 background: prov.connected ? 'rgba(80,200,120,0.12)' : 'var(--bg-3)',
                                 border: `1px solid ${prov.connected ? 'rgba(80,200,120,0.3)' : 'var(--border)'}`,
                               }}>
                                 {prov.connected ? 'Connected' : 'Not Connected'}
                               </span>
                               {/* Buttons */}
                               {envConnected ? (
                                 // Connected via env var — can't remove via UI, show why
                                 <span title={`Connected via ${prov.source} variable — remove ${prov.env?.[0] ?? 'the env var'} from your environment to disconnect`}
                                   style={{ fontSize: 11, padding: '2px 7px', borderRadius: 3, color: 'var(--text-4)', border: '1px solid var(--border)', cursor: 'help' }}>
                                   via {prov.source} var
                                 </span>
                               ) : prov.connected ? (
                                 <>
                                   <button disabled={!!actionLoading} onClick={openConnectModal}
                                     style={{ padding: '3px 8px', fontSize: 11, borderRadius: 3, cursor: actionLoading ? 'not-allowed' : 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', opacity: actionLoading ? 0.6 : 1 }}>
                                     Re-auth
                                   </button>
                                   {canDisconnect && (
                                     <button disabled={!!actionLoading} onClick={doDisconnect}
                                       style={{ padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: actionLoading ? 'not-allowed' : 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--red)', opacity: actionLoading ? 0.6 : 1 }}>
                                       {actionLoading === 'disconnecting' ? 'Disconnecting…' : 'Disconnect'}
                                     </button>
                                   )}
                                 </>
                               ) : (
                                 <button disabled={!!actionLoading} onClick={openConnectModal}
                                   style={{ padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: actionLoading ? 'not-allowed' : 'pointer', border: 'none', background: 'var(--accent)', color: 'white', opacity: actionLoading ? 0.6 : 1 }}>
                                   {actionLoading === 'connecting' ? 'Connecting…' : 'Connect'}
                                 </button>
                               )}
                             </div>

                             {/* Provider meta */}
                             <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: 'var(--text-4)' }}>
                               <span>ID: <code style={{ fontFamily: 'monospace', background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>{prov.id}</code></span>
                               {modelCount > 0 && <span>{modelCount} model{modelCount !== 1 ? 's' : ''}</span>}
                               {prov.defaultModel && <span>Default: <code style={{ fontFamily: 'monospace', background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>{prov.defaultModel}</code></span>}
                             </div>

                             {/* Env vars + auth badges row */}
                             <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                               {prov.env?.map(e => (
                                 <span key={e} style={{ fontSize: 10, padding: '1px 6px', background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 3, color: 'var(--text-4)', fontFamily: 'monospace' }}>{e}</span>
                               ))}
                               {hasApiAuth && <span style={{ fontSize: 10, padding: '1px 6px', background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 3, color: 'var(--text-3)' }}>API Key</span>}
                               {hasOauthAuth && <span style={{ fontSize: 10, padding: '1px 6px', background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 3, color: 'var(--text-3)' }}>OAuth</span>}
                             </div>
                           </div>
                         </div>
                       );
                     })}
                   </div>
                 )}
               </div>
             )}

             {selectedPage === 'commands' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Slash Commands</h3>
                  <button onClick={() => setShowAddCommand(true)} style={{ padding: '4px 8px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 12 }}>Add</button>
                </div>
                {showAddCommand && (
                  <CommandEditor command={newCommand} onSave={saveCommand} onCancel={() => { setShowAddCommand(false); setNewCommand({ file: '', name: '', description: '', agent: 'build', content: '' }); }} />
                )}
                {commandLoading ? (
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading...</div>
                ) : commands.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No commands configured.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {commands.map(cmd => (
                      <div key={cmd.file} style={{ borderRadius: 4, border: '1px solid var(--border)', overflow: 'hidden' }}>
                        {editingCommand?.file === cmd.file ? (
                          <CommandEditor
                            command={editingCommand}
                            onSave={(updated) => { saveCommand(updated); setEditingCommand(null); setEditingCommandDraft(null); }}
                            onCancel={() => { setEditingCommand(null); setEditingCommandDraft(null); }}
                          />
                        ) : (
                          <div style={{ padding: '10px 12px', background: 'var(--bg-2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{cmd.name}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-4)', background: 'var(--bg-3)', padding: '1px 6px', borderRadius: 3 }}>{cmd.agent}</span>
                              <button onClick={() => setEditingCommand(cmd)} style={{ padding: '3px 8px', background: 'var(--accent)', border: 'none', borderRadius: 3, color: 'white', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                              <button onClick={() => deleteCommand(cmd.file)} style={{ padding: '3px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-3)', cursor: 'pointer', fontSize: 11 }}>Delete</button>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 2 }}>{cmd.description}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-4)', whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>{cmd.content.slice(0, 100)}{cmd.content.length > 100 ? '...' : ''}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
               </div>
             )}
           </div>
         </div>

         {/* Provider Auth Modal */}
         {showAuthForm && selectedProvider && authMethod && (
           <div style={{
             position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
             display: 'flex', alignItems: 'center', justifyContent: 'center'
           }} onClick={() => setShowAuthForm(false)}>
             <div style={{
               background: 'var(--bg)', borderRadius: 8, width: 480, maxWidth: '90%',
               border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
             }} onClick={e => e.stopPropagation()}>
               <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
                   Connect {selectedProvider.displayName || selectedProvider.name}
                 </h3>
                 <button onClick={() => setShowAuthForm(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>
               </div>
               <div style={{ padding: '16px 20px' }}>
                 {/* Auth method tabs if multiple */}
                 {selectedProvider.authMethods && selectedProvider.authMethods.length > 1 && (
                   <div style={{ marginBottom: 16 }}>
                     <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Auth Method</label>
                     <div style={{ display: 'flex', gap: 6 }}>
                       {selectedProvider.authMethods.map((m, i) => (
                         <button key={i}
                           onClick={() => { setAuthMethod(m); setAuthMethodIndex(i); setAuthValues({}); }}
                           style={{
                             padding: '4px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                             border: `1px solid ${authMethodIndex === i ? 'var(--accent)' : 'var(--border)'}`,
                             background: authMethodIndex === i ? 'var(--accent)' : 'transparent',
                             color: authMethodIndex === i ? 'white' : 'var(--text-3)',
                           }}
                         >{m.label}</button>
                       ))}
                     </div>
                   </div>
                 )}

                 {/* OAuth flow */}
                 {authMethod.type === 'oauth' ? (
                   <div>
                     <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
                       Click below to open the authorization page in your browser. After approving, come back here.
                     </p>
                     {/* Any pre-auth prompts (e.g. enterprise URL) */}
                     {authMethod.prompts?.filter(p => !p.when || (p.when.op === 'eq' ? authValues[p.when.key] === p.when.value : authValues[p.when.key] !== p.when.value)).map(prompt => (
                       <div key={prompt.key} style={{ marginBottom: 14 }}>
                         <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>{prompt.message}</label>
                         <input
                           type="text"
                           value={authValues[prompt.key] || ''}
                           onChange={e => setAuthValues(prev => ({ ...prev, [prompt.key]: e.target.value }))}
                           placeholder={'placeholder' in prompt ? prompt.placeholder : undefined}
                           style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 13 }}
                         />
                       </div>
                     ))}
                     <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                       <button onClick={() => setShowAuthForm(false)}
                         style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>
                         Cancel
                       </button>
                       <button
                         onClick={async () => {
                           if (!selectedProvider) return;
                           setProviderActionLoading(prev => ({ ...prev, [selectedProvider.id]: 'connecting' }));
                           try {
                             const client = await getClient();
                             const resp = await client.provider.oauth.authorize({
                               providerID: selectedProvider.id,
                               directory: workingDir,
                               method: authMethodIndex,
                               inputs: authValues,
                             });
                             const data = (resp as any)?.data ?? resp;
                             if (data?.url) {
                               window.open(data.url, '_blank');
                             }
                             setShowAuthForm(false);
                           } catch (e: any) {
                             console.error('[SDK] OAuth authorize failed:', e);
                             alert(`OAuth failed: ${e?.message || 'Unknown error'}`);
                           } finally {
                             setProviderActionLoading(prev => { const n = { ...prev }; delete n[selectedProvider.id]; return n; });
                           }
                         }}
                         style={{ padding: '6px 14px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 12 }}
                       >
                         Open Authorization Page
                       </button>
                     </div>
                   </div>
                 ) : (
                   /* API key flow */
                   <div>
                     {authMethod.prompts && authMethod.prompts.length > 0 ? (
                       authMethod.prompts
                         .filter(p => !p.when || (p.when.op === 'eq' ? authValues[p.when.key] === p.when.value : authValues[p.when.key] !== p.when.value))
                         .map(prompt => (
                           <div key={prompt.key} style={{ marginBottom: 14 }}>
                             <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>{prompt.message}</label>
                             {prompt.type === 'select' ? (
                               <select
                                 value={authValues[prompt.key] || ''}
                                 onChange={e => setAuthValues(prev => ({ ...prev, [prompt.key]: e.target.value }))}
                                 style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 13 }}
                               >
                                 <option value="">Select...</option>
                                 {prompt.options?.map(opt => (
                                   <option key={opt.value} value={opt.value}>{opt.label}{opt.hint ? ` — ${opt.hint}` : ''}</option>
                                 ))}
                               </select>
                             ) : (
                               <input
                                 type="password"
                                 value={authValues[prompt.key] || ''}
                                 onChange={e => setAuthValues(prev => ({ ...prev, [prompt.key]: e.target.value }))}
                                 placeholder={'placeholder' in prompt ? prompt.placeholder : undefined}
                                 style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 13 }}
                               />
                             )}
                           </div>
                         ))
                     ) : (
                       /* Fallback: no prompts defined — show a generic API key input */
                       <div style={{ marginBottom: 14 }}>
                         <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                           API Key{selectedProvider.env?.[0] ? ` (${selectedProvider.env[0]})` : ''}
                         </label>
                         <input
                           type="password"
                           value={authValues['key'] || ''}
                           onChange={e => setAuthValues(prev => ({ ...prev, key: e.target.value }))}
                           placeholder="sk-..."
                           style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 13 }}
                         />
                       </div>
                     )}
                     <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                       <button onClick={() => setShowAuthForm(false)}
                         style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>
                         Cancel
                       </button>
                       <button
                         onClick={async () => {
                           if (!selectedProvider) return;
                           console.log('[Connect] authValues:', authValues, 'prompts:', authMethod.prompts);
                           // Collect all prompt values — try every prompt key, then 'key' fallback
                           const allKeys = authMethod.prompts?.map(p => p.key) ?? ['key'];
                           const keyValue = allKeys.map(k => authValues[k]).find(v => v?.trim()) || authValues['key'] || '';
                           console.log('[Connect] resolved keyValue length:', keyValue.length);
                           if (!keyValue.trim()) {
                             alert('Please enter an API key.');
                             return;
                           }
                           setProviderActionLoading(prev => ({ ...prev, [selectedProvider.id]: 'connecting' }));
                           try {
                             const client = await getClient();
                             console.log('[Connect] calling auth.set for', selectedProvider.id);
                             const setResp = await client.auth.set({
                               providerID: selectedProvider.id,
                               auth: { type: 'api', key: keyValue.trim() },
                             });
                             console.log('[Connect] auth.set response:', setResp);
                             setShowAuthForm(false);
                             // Re-fetch true state from SDK after saving
                             const resp = await client.provider.list({ directory: workingDir });
                             const data = (resp as any)?.data ?? resp;
                             console.log('[Connect] provider.list after save:', data);
                             const connectedIds: string[] = data?.connected ?? [];
                             const providersList: any[] = data?.all ?? [];
                             setSdkProviders(prev => {
                               const updated = prev.map(p => {
                                 const fresh = providersList.find((x: any) => x.id === p.id);
                                 return {
                                   ...p,
                                   connected: connectedIds.includes(p.id),
                                   source: fresh?.source ?? p.source,
                                 };
                               });
                               return [...updated].sort((a, b) => {
                                 if (a.connected !== b.connected) return a.connected ? -1 : 1;
                                 return a.name.localeCompare(b.name);
                               });
                             });
                           } catch (e: any) {
                             console.error('[SDK] Auth set failed:', e);
                             alert(`Failed: ${e?.message || 'Unknown error'}`);
                           } finally {
                             setProviderActionLoading(prev => { const n = { ...prev }; delete n[selectedProvider.id]; return n; });
                           }
                         }}
                         style={{ padding: '6px 14px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 12 }}
                       >
                         Connect
                       </button>
                     </div>
                   </div>
                 )}
               </div>
             </div>
           </div>
         )}

         <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              disabled={restartStatus === 'restarting'}
              onClick={async () => {
                if (!confirm('Restart OpenCode server? This will disconnect all sessions.')) return;
                setRestartStatus('restarting');
                setRestartError(null);

                // Fire the restart — server responds immediately
                try {
                  await fetch('/restart', { method: 'POST' });
                } catch {
                  // network error before response — server may still be restarting
                }

                // Poll /health until isOpenCodeReady or timeout (30s)
                const deadline = Date.now() + 30000;
                let ready = false;
                let lastError: string | null = null;

                while (Date.now() < deadline) {
                  await new Promise(r => setTimeout(r, 1000));
                  try {
                    const res = await fetch('/health');
                    if (res.ok) {
                      const data = await res.json();
                      if (data.isOpenCodeReady) { ready = true; break; }
                      if (data.lastError) lastError = data.lastError;
                    }
                  } catch {}
                }

                if (ready) {
                  setRestartStatus('done');
                  setTimeout(() => window.location.reload(), 500);
                } else {
                  setRestartStatus('error');
                  setRestartError(lastError ?? 'OpenCode did not become ready in time. Check server logs.');
                }
              }}
              style={{
                padding: '6px 12px',
                background: restartStatus === 'restarting' ? 'var(--text-3)' : 'var(--red)',
                border: 'none', borderRadius: 4, color: 'white',
                cursor: restartStatus === 'restarting' ? 'not-allowed' : 'pointer',
                opacity: restartStatus === 'restarting' ? 0.7 : 1,
              }}
            >
              {restartStatus === 'restarting' ? 'Restarting…' : restartStatus === 'done' ? 'Reloading…' : 'Restart OpenCode'}
            </button>
            {restartStatus === 'error' && restartError && (
              <span style={{ fontSize: 11, color: 'var(--red)', maxWidth: 300 }}>{restartError}</span>
            )}

            {selectedPage === 'appearance' && (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Appearance</h3>

                {/* Streaming mode toggle */}
                <div style={{ padding: '14px 16px', background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>True Streaming</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                        Show text as it arrives token by token. When off, text appears in larger chunks with full Markdown formatting during generation.
                      </div>
                    </div>
                    <button
                      onClick={() => setStreamingMode(!streamingMode)}
                      style={{
                        flexShrink: 0,
                        width: 44, height: 24, borderRadius: 12,
                        background: streamingMode ? 'var(--accent)' : 'var(--bg-4)',
                        border: '1px solid var(--border-2)',
                        cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                        padding: 0,
                      }}
                      title={streamingMode ? 'Disable streaming' : 'Enable streaming'}
                    >
                      <span style={{
                        position: 'absolute', top: 2,
                        left: streamingMode ? 22 : 2,
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'white',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-4)' }}>
                    {streamingMode
                      ? '✓ Streaming on — text renders as plain text while generating, switches to Markdown when done'
                      : '○ Streaming off — Markdown rendered on each chunk update'}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={saveSettings} style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      </div>
    </>
  );
}
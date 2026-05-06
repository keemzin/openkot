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

export function SettingsDialog({ onClose, models, workingDir }: SettingsDialogProps) {
  const [selectedPage, setSelectedPage] = useState<'mcp' | 'models' | 'commands' | 'appearance' | 'general'>('mcp');
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

  // Commands tab state
  const [commands, setCommands] = useState<Command[]>([]);
  const [showAddCommand, setShowAddCommand] = useState(false);
  const [editingCommand, setEditingCommand] = useState<Command | null>(null);
  const [newCommand, setNewCommand] = useState<Command>({ file: '', name: '', description: '', agent: 'build', content: '' });
  const [commandLoading, setCommandLoading] = useState(false);
  const [editingCommandDraft, setEditingCommandDraft] = useState<Command | null>(null);

  // General settings tab state
  const [generalSettings, setGeneralSettings] = useState({
    shell: '',
    logLevel: 'info',
    autoupdate: true,
    share: 'manual' as 'manual' | 'auto' | 'disabled',
    snapshot: true,
    disabledProviders: [] as string[],
  });
  const [generalLoading, setGeneralLoading] = useState(false);

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
        const mcpResp = await fetch('/api/config/mcp');
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

      // Load custom providers via SDK config.providers()
      try {
        const client = await getClient();
        const provResp = await client.config.providers({ directory: workingDir });
        const provData = provResp?.data ?? provResp;
        if (provData?.custom && Array.isArray(provData.custom)) {
          setCustomProviders(provData.custom);
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

      // Load general settings via SDK
      setGeneralLoading(true);
      try {
        const client = await getClient();
        const genResp = await client.config.get({ directory: workingDir });
        const genData = genResp?.data ?? genResp;
        if (genData) {
          setGeneralSettings({
            shell: genData.shell ?? '',
            logLevel: genData.logLevel ?? 'info',
            autoupdate: genData.autoupdate ?? true,
            share: genData.share ?? 'manual',
            snapshot: genData.snapshot ?? true,
            disabledProviders: genData.disabled_providers ?? [],
          });
        }
      } catch (e) {
        console.error('Failed to load general settings:', e);
      }
      setGeneralLoading(false);
    };

    loadConfig();
  }, [workingDir]);

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
    // Immediately delete from file via Express
    try {
      await fetch(`/api/config/mcp/${encodeURIComponent(name)}`, { method: 'DELETE' });
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
    if (!workingDir) {
      console.error('No working directory');
      return;
    }

    try {
      const client = await getClient();
      
      // Get current config first (to preserve other settings)
      const currentResp = await client.config.get({ directory: workingDir });
      const currentConfig = (currentResp?.data ?? currentResp) || {};
      
      // Build provider config object
      const providerConfig: Record<string, any> = {};
      // Get existing from current config
      if (currentConfig.provider && typeof currentConfig.provider === 'object') {
        Object.assign(providerConfig, currentConfig.provider);
      }
      
      // Add/update the new provider
      providerConfig[provider.name] = provider;

      // Merge all config
      const mergedConfig = { ...currentConfig, provider: providerConfig };

      await client.config.update({
        directory: workingDir,
        config: mergedConfig
      });

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

      // Gracefully reload OpenCode to make new provider available
      await fetch('/restart', { method: 'POST' });
      // Poll health endpoint until ready, then reload
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
    if (!workingDir) {
      console.error('No working directory');
      return;
    }

    try {
      const client = await getClient();
      
      // Get current config first (to preserve other settings)
      const currentResp = await client.config.get({ directory: workingDir });
      const currentConfig = (currentResp?.data ?? currentResp) || {};
      
      // Build provider config without the deleted one
      const providerConfig: Record<string, any> = {};
      if (currentConfig.provider && typeof currentConfig.provider === 'object') {
        Object.assign(providerConfig, currentConfig.provider);
      }
      delete providerConfig[name];

      // Merge all config
      const mergedConfig = { ...currentConfig, provider: providerConfig };

      await client.config.update({
        directory: workingDir,
        config: mergedConfig
      });

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

        // Use POST to create/replace — idempotent and handles both new and existing servers
        await fetch(`/api/config/mcp/${encodeURIComponent(name)}`, {
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
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300 }}
      />
      <div style={{
        position: 'fixed', top: isMobile ? 0 : '50%', left: isMobile ? 0 : '50%', transform: isMobile ? 'none' : 'translate(-50%, -50%)',
        width: isMobile ? '100%' : 800, height: isMobile ? '100%' : 600, background: 'var(--bg)', border: isMobile ? 'none' : '1px solid var(--border)',
        borderRadius: isMobile ? 0 : 8, zIndex: 301, display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Settings</h2>
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
            <button onClick={() => setSelectedPage('general')} style={{
              width: isMobile ? 'auto' : '100%',
              padding: isMobile ? '8px 12px' : '8px 16px',
              background: selectedPage === 'general' ? 'var(--bg-2)' : 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: 14,
              cursor: 'pointer',
              textAlign: 'left',
              borderLeft: !isMobile && selectedPage === 'general' ? '2px solid var(--accent)' : 'none',
              borderBottom: isMobile && selectedPage === 'general' ? '2px solid var(--accent)' : 'none'
            }}>General</button>
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
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Connected Models</h3>
                  {models.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No models connected. Use <code>/connect</code> in chat to add a provider.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {models.map(m => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 4 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{m.providerId}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {m.isFree && <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid rgba(237,180,73,0.3)', padding: '1px 6px', borderRadius: 4 }}>Free</span>}
                            {m.isDefault && <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--border)', border: '1px solid var(--border-2)', padding: '1px 6px', borderRadius: 4 }}>Default</span>}
                          </div>
                        </div>
                      ))}
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
          </div>        </div>
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

            {selectedPage === 'general' && (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>General Settings</h3>

                {generalLoading ? (
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading...</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Shell */}
                    <div style={{ padding: '14px 16px', background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Default Shell</div>
                      <input
                        value={generalSettings.shell}
                        onChange={e => setGeneralSettings(s => ({ ...s, shell: e.target.value }))}
                        placeholder="e.g., cmd.exe, powershell, bash"
                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 13 }}
                      />
                    </div>

                    {/* Log Level */}
                    <div style={{ padding: '14px 16px', background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Log Level</div>
                      <select
                        value={generalSettings.logLevel}
                        onChange={e => setGeneralSettings(s => ({ ...s, logLevel: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 13 }}
                      >
                        <option value="debug">Debug</option>
                        <option value="info">Info</option>
                        <option value="warn">Warn</option>
                        <option value="error">Error</option>
                      </select>
                    </div>

                    {/* Auto Update */}
                    <div style={{ padding: '14px 16px', background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>Auto Update</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Automatically update to latest version</div>
                        </div>
                        <button
                          onClick={() => setGeneralSettings(s => ({ ...s, autoupdate: !s.autoupdate }))}
                          style={{
                            width: 44, height: 24, borderRadius: 12,
                            background: generalSettings.autoupdate ? 'var(--accent)' : 'var(--bg-4)',
                            border: '1px solid var(--border-2)',
                            cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                            padding: 0,
                          }}
                        >
                          <div style={{
                            width: 20, height: 20, borderRadius: 10,
                            background: 'white',
                            position: 'absolute', top: 1,
                            left: generalSettings.autoupdate ? 22 : 1,
                            transition: 'left 0.2s',
                          }} />
                        </button>
                      </div>
                    </div>

                    {/* Snapshot */}
                    <div style={{ padding: '14px 16px', background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>Snapshot Tracking</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Enable filesystem snapshots for undo/redo</div>
                        </div>
                        <button
                          onClick={() => setGeneralSettings(s => ({ ...s, snapshot: !s.snapshot }))}
                          style={{
                            width: 44, height: 24, borderRadius: 12,
                            background: generalSettings.snapshot ? 'var(--accent)' : 'var(--bg-4)',
                            border: '1px solid var(--border-2)',
                            cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                            padding: 0,
                          }}
                        >
                          <div style={{
                            width: 20, height: 20, borderRadius: 10,
                            background: 'white',
                            position: 'absolute', top: 1,
                            left: generalSettings.snapshot ? 22 : 1,
                            transition: 'left 0.2s',
                          }} />
                        </button>
                      </div>
                    </div>

                    {/* Share */}
                    <div style={{ padding: '14px 16px', background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Sharing</div>
                      <select
                        value={generalSettings.share}
                        onChange={e => setGeneralSettings(s => ({ ...s, share: e.target.value as 'manual' | 'auto' | 'disabled' }))}
                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 13 }}
                      >
                        <option value="manual">Manual - Share via commands</option>
                        <option value="auto">Auto - Share automatically</option>
                        <option value="disabled">Disabled - No sharing</option>
                      </select>
                    </div>

                    {/* Save button */}
                    <button
                      onClick={async () => {
                        if (!workingDir) return;
                        try {
                          const client = await getClient();
                          
                          // Get current config first (to preserve other settings)
                          const currentResp = await client.config.get({ directory: workingDir });
                          const currentConfig = (currentResp?.data ?? currentResp) || {};
                          
                          // Merge general settings with existing config
                          const mergedConfig = {
                            ...currentConfig,
                            shell: generalSettings.shell,
                            logLevel: generalSettings.logLevel,
                            autoupdate: generalSettings.autoupdate,
                            share: generalSettings.share,
                            snapshot: generalSettings.snapshot,
                          };
                          
                          await client.config.update({
                            directory: workingDir,
                            config: mergedConfig
                          });
                          console.log('General settings saved');
                        } catch (e) {
                          console.error('Failed to save general settings:', e);
                        }
                      }}
                      style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 13 }}
                    >
                      Save Settings
                    </button>
                  </div>
                )}
              </div>
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
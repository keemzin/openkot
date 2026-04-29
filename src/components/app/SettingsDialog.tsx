import { useState, useEffect } from 'react';
import type { ModelInfo } from '../../types';
import { McpForm } from './McpForm';

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

interface SettingsDialogProps {
  onClose: () => void;
  models: ModelInfo[];
}

export function SettingsDialog({ onClose, models }: SettingsDialogProps) {
  const [selectedPage, setSelectedPage] = useState<'mcp' | 'models'>('mcp');
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMcp, setEditingMcp] = useState<McpServer | null>(null);
  const [showAddMcp, setShowAddMcp] = useState(false);

  // Models tab state
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProvider, setNewProvider] = useState<CustomProvider>({ name: '', displayName: '', npm: '@ai-sdk/openai-compatible', baseUrl: '', apiKey: '', models: [], environment: {} });
  const [newModelInput, setNewModelInput] = useState('');
  const [newEnvInput, setNewEnvInput] = useState('');
  const [providerLoading, setProviderLoading] = useState(false);

  useEffect(() => {
    fetch('/api/config/mcp')
      .then(async r => {
        if (!r.ok) return [];
        try { return await r.json(); } catch { return []; }
      })
      .then(data => {
        if (Array.isArray(data)) setMcpServers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Load custom providers from config
    setProviderLoading(true);
    fetch('/api/config/providers/custom')
      .then(async r => { if (!r.ok) return []; try { return await r.json(); } catch { return []; } })
      .then(data => { if (Array.isArray(data)) setCustomProviders(data); setProviderLoading(false); })
      .catch(() => setProviderLoading(false));
  }, []);

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

  const deleteMcp = (name: string) => {
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
    await fetch(`/api/config/providers/custom/${encodeURIComponent(provider.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider),
    });
    setCustomProviders(prev => {
      const idx = prev.findIndex(p => p.name === provider.name);
      if (idx >= 0) { const next = [...prev]; next[idx] = provider; return next; }
      return [...prev, provider];
    });
    setShowAddProvider(false);

    setNewProvider({ name: '', displayName: '', npm: '@ai-sdk/openai-compatible', baseUrl: '', apiKey: '', models: [], environment: {} });
    setNewModelInput('');
    setNewEnvInput('');
  };

  const deleteCustomProvider = async (name: string) => {
    await fetch(`/api/config/providers/custom/${encodeURIComponent(name)}`, { method: 'DELETE' });
    setCustomProviders(prev => prev.filter(p => p.name !== name));
  };

  const saveSettings = async () => {
    for (const server of mcpServers) {
      try {
        let res = await fetch(`/api/config/mcp/${server.name}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(server),
        });
        if (res.status === 404) {
          res = await fetch(`/api/config/mcp/${server.name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(server),
          });
        }
        if (!res.ok) {
          console.error('Failed to save MCP', server.name, res.status);
          continue;
        }

        if (server.enabled) {
          try {
            const health = await fetch('/health').then(r => r.json());
            if (!health.isOpenCodeReady) continue;
            const { name, enabled, ...config } = server;
            if (!config.type) config.type = 'local';
            const response = await fetch('/api/mcp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: server.name, config }),
            });
            if (response.ok) {
              console.log('Registered MCP with OpenCode:', server.name);
            }
          } catch (e) {
            console.error('Failed to register MCP with OpenCode', server.name, e);
          }
        }
      } catch (e) {
        console.error('Failed to save MCP', server.name, e);
      }
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
          </div>
          <div style={{ flex: 1, padding: isMobile ? '16px' : '20px', overflowY: 'auto' }}>
            {selectedPage === 'mcp' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>MCP Servers</h3>
                  <button onClick={() => setShowAddMcp(true)} style={{ padding: '4px 8px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 12 }}>Add</button>
                </div>
                {showAddMcp && <McpForm onSave={addMcp} onCancel={() => setShowAddMcp(false)} />}
                {editingMcp && <McpForm initial={editingMcp} onSave={(updates) => updateMcp(editingMcp.name, updates)} onCancel={() => setEditingMcp(null)} />}
                {loading ? (
                  <div style={{ fontSize: 14, color: 'var(--text-3)' }}>Loading...</div>
                ) : mcpServers.length === 0 ? (
                  <div style={{ fontSize: 14, color: 'var(--text-3)' }}>No MCP servers configured.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {mcpServers.map(server => (
                      <div key={server.name} style={{ padding: '12px', background: 'var(--bg-2)', borderRadius: 4, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <input type="checkbox" checked={server.enabled} onChange={() => toggleMcp(server.name)} style={{ accentColor: 'var(--accent)' }} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{server.name}</span>
                          <div style={{ flex: 1 }} />
                          <button onClick={() => setEditingMcp(server)} style={{ padding: '4px 8px', background: 'var(--accent)', border: 'none', borderRadius: 3, color: 'white', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                          <button onClick={() => deleteMcp(server.name)} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 2 }}>
                          Command: {server.command?.join(' ') || 'N/A'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                          Environment: {server.environment && Object.keys(server.environment).length > 0 ? JSON.stringify(server.environment) : 'None'}
                        </div>
                      </div>
                    ))}
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
                        <div key={p.name} style={{ padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{p.name}</span>
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
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>        </div>
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={async () => {
            if (!confirm('Restart OpenCode server? This will disconnect all sessions.')) return;
            await fetch('/restart', { method: 'POST' }).catch(() => {});
            window.location.reload();
          }} style={{ padding: '6px 12px', background: 'var(--red)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer' }}>Restart OpenCode</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={saveSettings} style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      </div>
    </>
  );
}
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

interface SettingsDialogProps {
  onClose: () => void;
  models: ModelInfo[];
}

export function SettingsDialog({ onClose, models }: SettingsDialogProps) {
  const [selectedPage, setSelectedPage] = useState<'mcp'>('mcp');
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMcp, setEditingMcp] = useState<McpServer | null>(null);
  const [showAddMcp, setShowAddMcp] = useState(false);

  useEffect(() => {
    fetch('/api/config/mcp')
      .then(async r => {
        if (!r.ok) return [];
        try {
          return await r.json();
        } catch {
          return [];
        }
      })
      .then(data => {
        if (Array.isArray(data)) {
          setMcpServers(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
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
          </div>
          <div style={{ flex: 1, padding: isMobile ? '16px' : '20px', overflowY: 'auto' }}>
            <div style={{ marginBottom: 16, padding: '12px', background: 'var(--bg-2)', borderRadius: 4, border: '1px solid var(--border-2)' }}>
              <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                <strong>Note:</strong> Provider and model setup should be done directly in OpenCode using the <code>/connect</code> command.
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                The GUI focuses on MCP server management. For AI provider connections, use OpenCode's native interface.
              </div>
            </div>
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
          </div>
        </div>
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
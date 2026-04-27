import { useState } from 'react';

interface McpServer {
  name: string;
  type: 'local' | 'remote';
  command?: string[];
  url?: string;
  enabled?: boolean;
  headers?: Record<string, string>;
  environment?: Record<string, string>;
}

interface McpFormProps {
  initial?: McpServer;
  onSave: (server: McpServer) => void;
  onCancel: () => void;
}

export function McpForm({ initial, onSave, onCancel }: McpFormProps) {
  const [name, setName] = useState(initial?.name || '');
  const [serverType, setServerType] = useState<'local' | 'remote'>(initial?.type || 'local');
  const [command, setCommand] = useState(initial?.command?.join(' ') || '');
  const [url, setUrl] = useState(initial?.url || '');
  const [headers, setHeaders] = useState<Array<{ key: string; value: string; visible: boolean }>>(
    Object.entries(initial?.headers || {}).map(([key, value]) => ({ key, value: String(value), visible: false }))
  );
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string; visible: boolean }>>(
    Object.entries(initial?.environment || {}).map(([key, value]) => ({ key, value: String(value), visible: false }))
  );
  const [enabled, setEnabled] = useState(initial?.enabled !== false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const parseCommand = (line: string): string[] => {
    if (!line.trim()) return [];
    const matches = line.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g);
    if (!matches) return [];
    return matches.map(arg => {
      if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
        return arg.slice(1, -1);
      }
      return arg;
    });
  };

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '', visible: false }]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', val: string) => {
    setEnvVars(envVars.map((v, i) => i === index ? { ...v, [field]: val } : v));
  };

  const toggleEnvVisibility = (index: number) => {
    setEnvVars(envVars.map((v, i) => i === index ? { ...v, visible: !v.visible } : v));
  };

  const addHeader = () => {
    setHeaders([...headers, { key: '', value: '', visible: false }]);
  };

  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const updateHeader = (index: number, field: 'key' | 'value', val: string) => {
    setHeaders(headers.map((v, i) => i === index ? { ...v, [field]: val } : v));
  };

  const toggleHeaderVisibility = (index: number) => {
    setHeaders(headers.map((v, i) => i === index ? { ...v, visible: !v.visible } : v));
  };

  const handleSave = () => {
    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    setNameError(null);

    const serverName = initial?.name || name.trim();
    let server: McpServer = {
      name: serverName,
      type: serverType,
      enabled,
    };

    if (serverType === 'local') {
      const cmdArgs = parseCommand(command);
      if (cmdArgs.length === 0) {
        setCommandError('Command cannot be empty');
        return;
      }
      setCommandError(null);

      const env: Record<string, string> = {};
      for (const { key, value } of envVars) {
        if (key.trim()) {
          env[key.trim()] = value;
        }
      }

      server.command = cmdArgs;
      if (Object.keys(env).length > 0) {
        server.environment = env;
      }
    } else {
      if (!url.trim()) {
        setUrlError('URL is required for remote servers');
        return;
      }
      setUrlError(null);

      server.url = url.trim();

      const hdrs: Record<string, string> = {};
      for (const { key, value } of headers) {
        if (key.trim()) {
          hdrs[key.trim()] = value;
        }
      }

      if (Object.keys(hdrs).length > 0) {
        server.headers = hdrs;
      }
    }

    onSave(server);
  };

  return (
    <div style={{ padding: '16px', background: 'var(--bg-2)', borderRadius: 4, marginBottom: 16 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{initial ? 'Edit' : 'Add'} MCP Server</h4>
      
      {!initial && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-3)', borderRadius: 4, marginBottom: 12, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-2)' }}>Example mapping:</strong><br />
          <code style={{ fontSize: 10, fontFamily: 'monospace' }}>
            {`{ "mcpServers": { "my-server": { "command": "npx", "args": ["pkg", "--flag"] } } }`}
          </code><br />
          Name: <code>my-server</code>, Command: <code>npx pkg --flag</code>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2, display: 'block' }}>Server Name</label>
          <input placeholder="e.g., jina-mcp-tools" value={name} onChange={e => setName(e.target.value)} disabled={!!initial} style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, background: initial ? 'var(--bg-2)' : 'var(--bg)', color: 'var(--text)', width: '100%', cursor: initial ? 'not-allowed' : 'text' }} />
          {nameError && <div style={{ fontSize: 12, color: '#ff6b6b', marginTop: 4 }}>{nameError}</div>}
          {initial && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>Name cannot be changed</div>}
        </div>

        <div>
          <label style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2, display: 'block' }}>Server Type</label>
          <div style={{ display: 'flex', background: 'var(--bg-2)', borderRadius: 5, padding: 2, gap: 1 }}>
            {(['local', 'remote'] as const).map(t => (
              <button key={t} onClick={() => setServerType(t)} type="button"
                style={{ flex: 1, background: serverType === t ? 'var(--bg-3)' : 'transparent', border: 'none', cursor: 'pointer', color: serverType === t ? 'var(--text)' : 'var(--text-4)', fontSize: 11, padding: '4px 8px', borderRadius: 4, fontFamily: 'inherit', textTransform: 'capitalize' }}>
                {t}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 2 }}>
            {serverType === 'local' ? 'Runs a local command (e.g., npx, node)' : 'Connects to a remote MCP server via HTTP'}
          </div>
        </div>

        {serverType === 'local' ? (
          <>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2, display: 'block' }}>Command</label>
              <input placeholder='e.g., npx jina-mcp-tools --transport stdio --tokens-per-page 15000' value={command} onChange={e => setCommand(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', width: '100%' }} />
              {commandError && <div style={{ fontSize: 12, color: '#ff6b6b', marginTop: 4 }}>{commandError}</div>}
            </div>
            
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>Environment Variables ({envVars.length})</span>
                </div>
                <button onClick={addEnvVar} type="button" style={{ padding: '2px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer', fontSize: 11 }}>+ add</button>
              </div>
              {envVars.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {envVars.map((envVar, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input 
                        placeholder="KEY" 
                        value={envVar.key} 
                        onChange={e => updateEnvVar(idx, 'key', e.target.value)}
                        style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', flex: 1, fontSize: 12, fontFamily: 'monospace' }}
                      />
                      <div style={{ position: 'relative', flex: 2 }}>
                        <input 
                          type={envVar.visible ? 'text' : 'password'}
                          placeholder="value" 
                          value={envVar.value} 
                          onChange={e => updateEnvVar(idx, 'value', e.target.value)}
                          style={{ padding: '6px 32px 6px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', width: '100%', fontSize: 12 }}
                        />
                        <button
                          onClick={() => toggleEnvVisibility(idx)}
                          type="button"
                          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', fontSize: 14, padding: 2 }}
                        >
                          {envVar.visible ? '👁' : '👁‍🗨'}
                        </button>
                      </div>
                      <button 
                        onClick={() => removeEnvVar(idx)}
                        style={{ padding: '6px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-4)', cursor: 'pointer', fontSize: 12 }}
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2, display: 'block' }}>URL</label>
              <input placeholder='e.g., https://mcp.jina.ai/v1' value={url} onChange={e => setUrl(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', width: '100%' }} />
              {urlError && <div style={{ fontSize: 12, color: '#ff6b6b', marginTop: 4 }}>{urlError}</div>}
            </div>
            
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>Headers ({headers.length})</span>
                </div>
                <button onClick={addHeader} type="button" style={{ padding: '2px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer', fontSize: 11 }}>+ add</button>
              </div>
              {headers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {headers.map((header, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input 
                        placeholder="Authorization" 
                        value={header.key} 
                        onChange={e => updateHeader(idx, 'key', e.target.value)}
                        style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', flex: 1, fontSize: 12, fontFamily: 'monospace' }}
                      />
                      <div style={{ position: 'relative', flex: 2 }}>
                        <input 
                          type={header.visible ? 'text' : 'password'}
                          placeholder="Bearer ${TOKEN}" 
                          value={header.value} 
                          onChange={e => updateHeader(idx, 'value', e.target.value)}
                          style={{ padding: '6px 32px 6px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', width: '100%', fontSize: 12 }}
                        />
                        <button
                          onClick={() => toggleHeaderVisibility(idx)}
                          type="button"
                          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', fontSize: 14, padding: 2 }}
                        >
                          {header.visible ? '👁' : '👁‍🗨'}
                        </button>
                      </div>
                      <button 
                        onClick={() => removeHeader(idx)}
                        type="button"
                        style={{ padding: '6px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-4)', cursor: 'pointer', fontSize: 12 }}
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Enabled</span>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={handleSave} type="button" style={{ padding: '4px 8px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer' }}>Save</button>
        <button onClick={onCancel} type="button" style={{ padding: '4px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}
import React, { useState, useEffect, useCallback } from 'react';

interface Instance {
  id: string;
  name: string;
  directory: string;
  port: number;
  opencodePort: number;
  pid: number;
  startedAt: string;
}

export function InstancesPanel({ currentPort }: { currentPort: number }) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const r = await fetch('/instances', { signal: controller.signal });
      if (r.ok) {
        setInstances(await r.json());
      } else {
        console.error('Failed to load instances:', r.status);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Failed to load instances:', e);
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const navigate = (port: number) => {
    const url = `${window.location.protocol}//${window.location.hostname}:${port}`;
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>
        Loading instances...
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Running Instances
        </h3>
        <button
          onClick={load}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', fontSize: 16, padding: '2px 6px' }}
          title="Refresh"
        >↻</button>
      </div>

      {instances.length === 0 ? (
        <div style={{ color: 'var(--text-4)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
          No other instances running.
          <div style={{ marginTop: 8, fontSize: 12 }}>Start another project with <code style={{ background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 3 }}>openkot</code></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {instances.map(inst => {
            const isCurrent = inst.port === currentPort;
            return (
              <div
                key={inst.id}
                onClick={() => !isCurrent && navigate(inst.port)}
                style={{
                  padding: '12px 14px',
                  background: isCurrent ? 'var(--bg-3)' : 'var(--bg-2)',
                  border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8,
                  cursor: isCurrent ? 'default' : 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Green dot */}
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green, #4a9d5f)', display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{inst.name}</span>
                    {isCurrent && (
                      <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid rgba(237,180,73,0.3)', padding: '1px 6px', borderRadius: 4 }}>
                        current
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-4)' }}>:{inst.port}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inst.directory}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-5)', marginTop: 4 }}>
                  Started {new Date(inst.startedAt).toLocaleTimeString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

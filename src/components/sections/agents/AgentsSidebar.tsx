import { useState, useEffect } from 'react';
import { useAgentsStore, filterVisibleAgents, isAgentBuiltIn } from '../../../stores/useAgentsStore';

interface AgentsSidebarProps {
  onItemSelect?: () => void;
}

export function AgentsSidebar({ onItemSelect }: AgentsSidebarProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const {
    selectedAgentName,
    agents,
    isLoading,
    setSelectedAgent,
    setAgentDraft,
    createAgent,
    deleteAgent,
    loadAgents,
  } = useAgentsStore();

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const visibleAgents = filterVisibleAgents(agents);
  const builtInCount = visibleAgents.filter(a => isAgentBuiltIn(a)).length;
  const customCount = visibleAgents.filter(a => !isAgentBuiltIn(a)).length;

  const handleCreateNew = () => {
    const baseName = 'new-agent';
    let newName = baseName;
    let counter = 1;
    while (agents.some((a) => a.name === newName)) {
      counter++;
      newName = `${baseName}-${counter}`;
    }
    setAgentDraft({ name: newName, scope: 'user' });
    setSelectedAgent(newName);
    onItemSelect?.();
  };

  const handleDelete = async (name: string) => {
    const success = await deleteAgent(name);
    if (success) {
      setConfirmDelete(null);
    }
  };

  const getAgentIcon = (agent: typeof visibleAgents[0]) => {
    if (isAgentBuiltIn(agent)) {
      return '⚙️';
    }
    switch (agent.mode) {
      case 'primary': return '🔨';
      case 'all': return '🌐';
      default: return '🤖';
    }
  };

  const getAgentSubtitle = (agent: typeof visibleAgents[0]) => {
    if (agent.description) return agent.description;
    if (isAgentBuiltIn(agent)) return 'Built-in agent';
    return agent.mode || 'subagent';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-1)',
      }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Agents
          </span>
          {visibleAgents.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
              {customCount} custom, {builtInCount} built-in
            </div>
          )}
        </div>
        <button
          onClick={handleCreateNew}
          style={{
            background: 'var(--accent)', border: 'none', borderRadius: 4,
            color: 'white', cursor: 'pointer', fontSize: 11, padding: '4px 10px',
            fontFamily: 'inherit', fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <span>+</span> New
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {isLoading ? (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>⏳</div>
            <div style={{ fontSize: 12, color: 'var(--text-4)' }}>Loading agents...</div>
          </div>
        ) : visibleAgents.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>🤖</div>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>No agents yet</div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 12 }}>
              Create your first custom agent
            </div>
            <button
              onClick={handleCreateNew}
              style={{
                background: 'var(--accent)', border: 'none', borderRadius: 4,
                color: 'white', cursor: 'pointer', fontSize: 12, padding: '6px 12px',
                fontFamily: 'inherit', fontWeight: 500,
              }}
            >
              Create Agent
            </button>
          </div>
        ) : (
          visibleAgents.map((agent) => (
            <div key={agent.name} style={{ position: 'relative', padding: '0 6px' }}>
              <button
                onClick={() => { setSelectedAgent(agent.name); setAgentDraft(null); onItemSelect?.(); }}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%', padding: '8px 10px',
                  background: selectedAgentName === agent.name ? 'var(--bg-2)' : 'transparent',
                  border: 'none', textAlign: 'left', cursor: 'pointer',
                  borderRadius: 4, margin: '0 2px',
                  borderLeft: selectedAgentName === agent.name ? '3px solid var(--accent)' : '3px solid transparent',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 16, marginRight: 8, opacity: 0.8 }}>
                  {getAgentIcon(agent)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500, color: 'var(--text)',
                    fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {agent.name}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--text-4)', marginTop: 1, fontFamily: 'inherit',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {getAgentSubtitle(agent)}
                  </div>
                </div>
                {isAgentBuiltIn(agent) && (
                  <span style={{
                    fontSize: 9, padding: '2px 5px', borderRadius: 3,
                    background: 'var(--bg)', color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600,
                  }}>
                    Built-in
                  </span>
                )}
              </button>
              {!isAgentBuiltIn(agent) && selectedAgentName === agent.name && (
                <button
                  onClick={() => setConfirmDelete(agent.name)}
                  style={{
                    position: 'absolute', top: 8, right: 10,
                    background: 'transparent', border: 'none',
                    color: 'var(--text-4)', cursor: 'pointer', fontSize: 14,
                    padding: '2px 4px', lineHeight: 1,
                    opacity: 0.6, transition: 'opacity 0.15s',
                  }}
                  title="Delete agent"
                  onMouseOver={e => e.currentTarget.style.opacity = '1'}
                  onMouseOut={e => e.currentTarget.style.opacity = '0.6'}
                >
                  ✕
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 20, maxWidth: 320, width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>⚠️</span>
              <h4 style={{ margin: 0, fontSize: 15, color: 'var(--text)', fontWeight: 600 }}>
                Delete agent?
              </h4>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong style={{ color: 'var(--text)' }}>{confirmDelete}</strong>?
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={{
                padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer', fontSize: 12,
                fontFamily: 'inherit', transition: 'all 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--bg)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDelete)} style={{
                padding: '6px 14px', background: '#d32f2f', border: 'none',
                borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 12,
                fontFamily: 'inherit', fontWeight: 500,
              }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

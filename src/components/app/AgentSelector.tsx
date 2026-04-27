import React from 'react';

type Agent = 'build' | 'plan';

const AGENTS: Array<{ id: Agent; name: string; desc: string }> = [
  { id: 'build', name: 'Build', desc: 'Write and execute code directly' },
  { id: 'plan', name: 'Plan', desc: 'Plan mode - no file editing allowed' },
];

interface AgentSelectorProps {
  selectedAgent: Agent;
  setSelectedAgent: (agent: Agent) => void;
  agentOpen: boolean;
  setAgentOpen: (open: boolean) => void;
}

export function AgentSelector({ selectedAgent, setSelectedAgent, agentOpen, setAgentOpen }: AgentSelectorProps) {
  return (
    <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
      <button
        onClick={() => setAgentOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: agentOpen ? 'var(--bg-5)' : 'transparent',
          border: 'none', cursor: 'pointer',
          padding: '3px 6px', borderRadius: 6,
          color: selectedAgent === 'build' ? 'var(--text-2)' : 'var(--accent)',
          fontSize: 12, fontFamily: 'inherit',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
        </svg>
        <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedAgent === 'build' ? 'Build' : 'Plan'}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {agentOpen && (
        <>
          <div onClick={() => setAgentOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
          <div style={{
            position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
            background: 'var(--bg-3)', border: '1px solid var(--border-2)',
            borderRadius: 8, minWidth: 200, boxShadow: '0 -4px 20px rgba(0,0,0,0.15)', zIndex: 99,
          }}>
            {AGENTS.map(agent => (
              <button
                key={agent.id}
                onClick={() => { setSelectedAgent(agent.id); setAgentOpen(false); }}
                style={{
                  display: 'block', width: '100%', padding: '10px 14px',
                  background: selectedAgent === agent.id ? 'var(--accent)' : 'transparent',
                  border: 'none', textAlign: 'left', cursor: 'pointer',
                  color: selectedAgent === agent.id ? 'var(--bg)' : 'var(--text)',
                  borderRadius: agent.id === 'build' ? '8px 8px 0 0' : '0 0 8px 8px',
                }}
                onMouseEnter={e => { if (selectedAgent !== agent.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-4)'; }}
                onMouseLeave={e => { if (selectedAgent !== agent.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>{agent.name}</div>
                <div style={{ fontSize: 11, color: selectedAgent === agent.id ? 'var(--bg)' : 'var(--text-4)' }}>{agent.desc}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
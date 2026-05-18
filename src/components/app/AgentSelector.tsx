import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useAgentsStore, filterVisibleAgents, isAgentBuiltIn } from '../../stores/useAgentsStore';

interface AgentSelectorProps {
  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;
  agentOpen: boolean;
  setAgentOpen: (open: boolean) => void;
}

export function AgentSelector({ selectedAgent, setSelectedAgent, agentOpen, setAgentOpen }: AgentSelectorProps) {
  const { agents, loadAgents } = useAgentsStore();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({ display: 'none' });

  useEffect(() => {
    if (agents.length === 0) loadAgents();
  }, [loadAgents]);

  const updateDropdownPosition = useCallback(() => {
    if (!btnRef.current || !agentOpen) return;
    const rect = btnRef.current.getBoundingClientRect();
    const availAbove = rect.top - 12;
    const maxW = Math.min(360, window.innerWidth - 32);
    const style: React.CSSProperties = {
      position: 'fixed',
      bottom: window.innerHeight - rect.top + rect.height + 4,
      right: window.innerWidth - rect.right,
      background: 'var(--bg-3)',
      border: '1px solid var(--border-2)',
      borderRadius: 8,
      minWidth: 240,
      width: 'max-content',
      maxWidth: maxW,
      maxHeight: Math.min(320, availAbove),
      overflowY: 'auto',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.25)',
      zIndex: 1000,
    };
    setDropdownStyle(style);
  }, [agentOpen]);

  useEffect(() => {
    if (agentOpen) {
      updateDropdownPosition();
      window.addEventListener('resize', updateDropdownPosition);
      return () => window.removeEventListener('resize', updateDropdownPosition);
    }
  }, [agentOpen, updateDropdownPosition]);

  const displayAgents = useMemo(() => filterVisibleAgents(agents), [agents]);

  const currentAgent = agents.find(a => a.name === selectedAgent);
  const currentLabel = currentAgent?.description
    ? `${currentAgent.name} (${currentAgent.description})`
    : currentAgent?.name ?? 'Build';

  return (
    <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
      <button
        ref={btnRef}
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
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentLabel}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {agentOpen && (
        <>
          <div onClick={() => setAgentOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
          <div style={dropdownStyle}>
            {displayAgents.length === 0 ? (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
                No agents available
              </div>
            ) : displayAgents.map((agent, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === displayAgents.length - 1;
              const builtIn = isAgentBuiltIn(agent);
              return (
                <button
                  key={agent.name}
                  onClick={() => { setSelectedAgent(agent.name); setAgentOpen(false); }}
                  style={{
                    display: 'block', width: '100%', padding: '10px 14px',
                    background: selectedAgent === agent.name ? 'var(--accent)' : 'transparent',
                    border: 'none', textAlign: 'left', cursor: 'pointer',
                    color: selectedAgent === agent.name ? 'var(--bg)' : 'var(--text)',
                    borderRadius: isFirst ? '8px 8px 0 0' : isLast ? '0 0 8px 8px' : '0',
                  }}
                  onMouseEnter={e => { if (selectedAgent !== agent.name) (e.currentTarget as HTMLElement).style.background = 'var(--bg-4)'; }}
                  onMouseLeave={e => { if (selectedAgent !== agent.name) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>{agent.name}</div>
                    {builtIn && (
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 3,
                        background: 'var(--bg)', color: 'var(--text-3)',
                        textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600,
                      }}>
                        Built-in
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: selectedAgent === agent.name ? 'var(--bg)' : 'var(--text-4)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {agent.description || (builtIn ? 'Built-in agent' : agent.mode || 'subagent')}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
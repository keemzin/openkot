import { useState } from 'react';
import type { ModelInfo } from '../types';

interface ModelSelectorProps {
  // State
  models: ModelInfo[];
  selectedModel: ModelInfo | null;
  modelOpen: boolean;
  modelSearch: string;
  sessionId: string | null;
  isMobile: boolean;
  
  // Setters
  setSelectedModel: (model: ModelInfo | null) => void;
  setModelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setModelSearch: (search: string | ((prev: string) => string)) => void;
  setSessionModelSelections: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
}

export function ModelSelector({
  models,
  selectedModel,
  modelOpen,
  modelSearch,
  sessionId,
  isMobile,
  setSelectedModel,
  setModelOpen,
  setModelSearch,
  setSessionModelSelections,
}: ModelSelectorProps) {
  return (
    <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
      <button
        onClick={() => setModelOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: modelOpen ? 'var(--bg-5)' : 'transparent',
          border: 'none', cursor: 'pointer',
          padding: '3px 6px', borderRadius: 6,
          color: selectedModel?.isFree ? 'var(--accent)' : 'var(--text-2)',
          fontSize: 12, fontFamily: 'inherit',
          minWidth: 0, // Allow button to shrink
          maxWidth: isMobile ? 140 : 180, // Limit width on mobile
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
          <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
        </svg>
        <span style={{ 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap',
          minWidth: 0, // Allow text to shrink
          flex: 1,
        }}>
          {selectedModel?.name ?? 'Select model'}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {modelOpen && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={isMobile ? {
            position: 'fixed',
            bottom: 70,
            left: 12,
            right: 12,
            background: 'var(--bg-4)',
            border: '1px solid var(--border-2)',
            borderRadius: 10,
            maxHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 -4px 32px rgba(0,0,0,0.7)',
            zIndex: 9999,
          } : {
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 6,
            background: 'var(--bg-4)',
            border: '1px solid var(--border-2)',
            borderRadius: 10,
            width: 320,
            maxWidth: 400,
            maxHeight: 420,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 -4px 32px rgba(0,0,0,0.7)',
            zIndex: 9999,
          }}
        >
          {/* Search input */}
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                value={modelSearch}
                onChange={e => setModelSearch(e.target.value)}
                placeholder="Search models..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 34px',
                  background: 'var(--bg-5)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
              {modelSearch && (
                <button
                  onClick={() => setModelSearch('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--text-3)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Models list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {(() => {
              const searchLower = modelSearch.toLowerCase().trim();
              const filteredModels = models.filter(m => 
                !searchLower || 
                m.name.toLowerCase().includes(searchLower) || 
                m.id.toLowerCase().includes(searchLower)
              );

              if (filteredModels.length === 0) {
                return (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                    No models match your search
                  </div>
                );
              }

              return filteredModels.map(m => (
                <button
                  key={m.id}
                  onClick={() => { 
                    setSelectedModel(m); 
                    setModelOpen(false);
                    setModelSearch('');
                    // Save model selection for current session
                    if (sessionId) {
                      setSessionModelSelections(prev => ({ ...prev, [sessionId]: m.id }));
                    }
                  }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px',
                    background: m.id === selectedModel?.id ? 'var(--bg-3)' : 'transparent',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    borderLeft: m.id === selectedModel?.id ? '2px solid var(--accent)' : '2px solid transparent',
                    minWidth: 0, // Allow flex item to shrink
                  }}
                  onMouseEnter={e => { if (m.id !== selectedModel?.id) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-5)'; }}
                  onMouseLeave={e => { if (m.id !== selectedModel?.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <span style={{ 
                    fontSize: 14, 
                    color: 'var(--text)', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap', 
                    flex: 1,
                    minWidth: 0, // Allow text to shrink
                  }}>
                    {m.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {m.isFree && (
                      <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid rgba(237,180,73,0.3)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>Free</span>
                    )}
                    {m.isDefault && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--border)', border: '1px solid var(--border-2)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>Default</span>
                    )}
                  </div>
                </button>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

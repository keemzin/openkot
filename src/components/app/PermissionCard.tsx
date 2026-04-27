import { useState } from 'react';
import type { PermissionRequest } from '../../types';

interface PermissionCardProps {
  permission: PermissionRequest;
  onReply: (requestID: string, response: 'once' | 'always' | 'reject') => Promise<void>;
}

export function PermissionCard({ permission, onReply }: PermissionCardProps) {
  const [isResponding, setIsResponding] = useState(false);

  const handleResponse = async (response: 'once' | 'always' | 'reject') => {
    setIsResponding(true);
    try {
      await onReply(permission.id, response);
    } catch { /* ignore */ }
    setIsResponding(false);
  };

  const tool = permission.permission.toLowerCase();
  const meta = permission.metadata || {};
  
  const renderContent = () => {
    if (tool === 'bash' || tool === 'shell' || tool === 'cmd') {
      const cmd = meta.command || meta.cmd || meta.script;
      return <pre style={{ fontSize: 12, padding: 8, background: 'var(--bg-1)', borderRadius: 4, overflowX: 'auto', margin: '4px 0' }}>{cmd}</pre>;
    }
    if (tool === 'write' || tool === 'edit') {
      const path = meta.path || meta.file_path || meta.filePath;
      return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>File: <code style={{ color: 'var(--accent)' }}>{path}</code></div>;
    }
    return <pre style={{ fontSize: 11, padding: 6, background: 'var(--bg-1)', borderRadius: 4 }}>{JSON.stringify(meta, null, 2)}</pre>;
  };

  return (
    <div style={{ border: '1px solid var(--accent)', borderRadius: 8, padding: 12, marginBottom: 8, background: 'var(--bg-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Permission Required</span>
        <span style={{ fontSize: 12, color: 'var(--text-4)', marginLeft: 'auto', fontFamily: 'monospace' }}>{permission.permission}</span>
      </div>

      <div style={{ marginBottom: 10 }}>
        {renderContent()}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => handleResponse('once')}
          disabled={isResponding}
          style={{
            padding: '5px 10px', fontSize: 12, border: 'none', borderRadius: 4,
            background: 'var(--green)', color: '#fff', cursor: 'pointer', opacity: isResponding ? 0.6 : 1
          }}
        >Allow</button>
        <button
          onClick={() => handleResponse('always')}
          disabled={isResponding}
          style={{
            padding: '5px 10px', fontSize: 12, border: '1px solid var(--border-2)', borderRadius: 4,
            background: 'var(--bg-3)', color: 'var(--text-2)', cursor: 'pointer', opacity: isResponding ? 0.6 : 1
          }}
        >Always</button>
        <button
          onClick={() => handleResponse('reject')}
          disabled={isResponding}
          style={{
            padding: '5px 10px', fontSize: 12, border: 'none', borderRadius: 4,
            background: 'var(--red)', color: '#fff', cursor: 'pointer', opacity: isResponding ? 0.6 : 1
          }}
        >Deny</button>
      </div>
    </div>
  );
}
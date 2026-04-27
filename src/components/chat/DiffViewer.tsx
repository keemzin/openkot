import React from 'react';
import { computeDiff } from '../../utils/toolUtils';

export function DiffViewer({ oldStr, newStr, filePath }: { oldStr: string; newStr: string; filePath?: string }) {
  const lines = React.useMemo(() => computeDiff(oldStr, newStr), [oldStr, newStr]);
  const fileName = filePath ? filePath.replace(/\\/g, '/').split('/').pop() : null;

  return (
    <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', marginTop: 4 }}>
      {fileName && (
        <div style={{ padding: '4px 10px', background: 'var(--bg-2)', fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', borderBottom: '1px solid var(--border)' }}>
          {fileName}
        </div>
      )}
      <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: 'monospace', fontSize: 11 }}>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} style={{ background: l.type === 'add' ? 'rgba(152,195,121,0.12)' : l.type === 'remove' ? 'rgba(224,108,117,0.12)' : 'transparent' }}>
                <td style={{ width: 16, paddingLeft: 8, paddingRight: 4, color: l.type === 'add' ? 'var(--green)' : l.type === 'remove' ? 'var(--red)' : 'var(--text-5)', userSelect: 'none', verticalAlign: 'top' }}>
                  {l.type === 'add' ? '+' : l.type === 'remove' ? '−' : ' '}
                </td>
                <td style={{ padding: '1px 8px 1px 0', color: l.type === 'add' ? 'var(--green)' : l.type === 'remove' ? 'var(--red)' : 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {l.line}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
import React from 'react';
import type { SessionContextUsage } from '../../types';

export function TokenUsageIndicator({ contextUsage }: { contextUsage: SessionContextUsage | null }) {
  if (!contextUsage || contextUsage.totalTokens === 0) return null;

  const percentage = Math.min(contextUsage.percentage, 999);
  const displayPercentage = percentage.toFixed(1);
  const color =
    percentage >= 90 ? 'var(--red)' :
    percentage >= 75 ? 'var(--orange)' : 'var(--green)';

  return (
    <span style={{ fontSize: 12, color, fontFamily: 'monospace' }}>
      {displayPercentage}%
    </span>
  );
}
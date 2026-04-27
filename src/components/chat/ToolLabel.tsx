import React from 'react';
import { normalizeToolName } from '../../utils/toolCategorization';

const FILE_PATH_LABEL_TOOLS = new Set([
    'read',
    'view',
    'file_read',
    'cat',
    'write',
    'create',
    'file_write',
    'edit',
    'multiedit',
    'apply_patch',
]);

export function shouldRenderGitPathLabel(toolName: string, label: string): boolean {
    const normalized = normalizeToolName(toolName);
    if (!FILE_PATH_LABEL_TOOLS.has(normalized)) {
        return false;
    }

    const trimmed = label.trim();
    if (!trimmed || trimmed === 'Patch' || /^\d+\s+files$/.test(trimmed)) {
        return false;
    }

    if (trimmed.includes('/') || trimmed.includes('\\')) {
        return true;
    }

    const baseName = trimmed.split(/[\\/]/).pop() || trimmed;
    if (baseName.startsWith('.') || baseName.includes('.')) {
        return true;
    }

    return /^[A-Za-z0-9_-]+$/.test(baseName);
}

interface ToolLabelProps {
    toolName: string;
    label: string;
    animateTailText?: boolean;
}

export function ToolLabel({ toolName, label, animateTailText = true }: ToolLabelProps) {
    const shouldShow = shouldRenderGitPathLabel(toolName, label);

    if (!shouldShow) {
        return null;
    }

    return (
        <span style={{ color: 'var(--tools-description)' }} title={label}>
            {label}
        </span>
    );
}
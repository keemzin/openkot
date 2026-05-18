import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAgentsStore, type PermissionAction, type PermissionRule, type AgentConfig, type AgentScope } from '../../../stores/useAgentsStore';

const STANDARD_PERMISSION_KEYS = [
  '*',
  'read', 'edit', 'glob', 'grep', 'list', 'bash', 'task', 'skill', 'lsp',
  'todoread', 'todowrite', 'webfetch', 'websearch', 'codesearch',
  'external_directory', 'doom_loop', 'question', 'plan_enter', 'plan_exit',
] as const;

type PermissionConfigValue = PermissionAction | Record<string, PermissionAction>;

const isPermissionAction = (v: unknown): v is PermissionAction =>
  v === 'allow' || v === 'ask' || v === 'deny';

const permissionConfigToRuleset = (config: unknown): PermissionRule[] => {
  if (!config || typeof config !== 'object') return [];
  if (Array.isArray(config)) return config as PermissionRule[];

  const rules: PermissionRule[] = [];
  for (const [permission, value] of Object.entries(config)) {
    if (isPermissionAction(value)) {
      rules.push({ permission, pattern: '*', action: value });
    } else if (typeof value === 'object' && value !== null) {
      for (const [pattern, action] of Object.entries(value)) {
        if (isPermissionAction(action)) {
          rules.push({ permission, pattern, action });
        }
      }
    }
  }
  return rules;
};

const rulesetToPermissionConfig = (rules: PermissionRule[]): Record<string, PermissionConfigValue> | undefined => {
  const valid = rules.filter(r => r.permission && r.pattern && isPermissionAction(r.action));
  if (valid.length === 0) return undefined;

  const grouped: Record<string, Record<string, PermissionAction>> = {};
  for (const rule of valid) {
    (grouped[rule.permission] ??= {})[rule.pattern] = rule.action;
  }

  const result: Record<string, PermissionConfigValue> = {};
  for (const [perm, patterns] of Object.entries(grouped)) {
    const keys = Object.keys(patterns);
    if (keys.length === 1 && keys[0] === '*') {
      result[perm] = patterns['*'];
    } else {
      result[perm] = patterns;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

const normalizeRuleset = (rules: PermissionRule[]): PermissionRule[] => {
  const map = new Map<string, PermissionRule>();
  for (const rule of rules) {
    if (!rule.permission || !rule.pattern || !isPermissionAction(rule.action)) continue;
    map.set(`${rule.permission}::${rule.pattern}`, rule);
  }
  return Array.from(map.values());
};

const getGlobalWildcardAction = (rules: PermissionRule[]): PermissionAction => {
  const global = rules.find(r => r.permission === '*' && r.pattern === '*');
  return global?.action ?? 'ask';
};

const formatPermissionLabel = (name: string): string => {
  if (name === '*') return 'Default';
  if (name === 'webfetch') return 'WebFetch';
  if (name === 'websearch') return 'WebSearch';
  if (name === 'codesearch') return 'CodeSearch';
  if (name === 'doom_loop') return 'Doom Loop';
  if (name === 'external_directory') return 'External Directory';
  if (name === 'todowrite') return 'TodoWrite';
  if (name === 'todoread') return 'TodoRead';
  if (name === 'plan_enter') return 'Plan Enter';
  if (name === 'plan_exit') return 'Plan Exit';
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/[_-]/g, ' ');
};

const permissionActionLabel = (action: PermissionAction): string => {
  switch (action) {
    case 'allow': return 'Allow';
    case 'ask': return 'Ask';
    case 'deny': return 'Deny';
  }
};

const actionColor = (action: PermissionAction): string => {
  switch (action) {
    case 'allow': return 'var(--status-success, #4caf50)';
    case 'ask': return 'var(--status-warning, #ff9800)';
    case 'deny': return 'var(--status-error, #f44336)';
  }
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

const SELECT_STYLE: React.CSSProperties = {
  padding: '4px 6px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
  outline: 'none',
};

const BTN_STYLE: React.CSSProperties = {
  padding: '5px 10px',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'inherit',
  fontWeight: 500,
};

export function AgentsPage() {
  const {
    agents,
    selectedAgentName,
    agentDraft,
    isSaving,
    setAgentDraft,
    setSelectedAgent,
    createAgent,
    updateAgent,
  } = useAgentsStore();

  const [draftName, setDraftName] = useState('');
  const [draftScope, setDraftScope] = useState<AgentScope>('user');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'primary' | 'subagent' | 'all'>('subagent');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState<number | undefined>(undefined);
  const [topP, setTopP] = useState<number | undefined>(undefined);
  const [prompt, setPrompt] = useState('');

  const [globalPermission, setGlobalPermission] = useState<PermissionAction>('ask');
  const [permissionRules, setPermissionRules] = useState<PermissionRule[]>([]);

  const [showAdvancedPermissions, setShowAdvancedPermissions] = useState(false);
  const [pendingPermName, setPendingPermName] = useState('');
  const [pendingPattern, setPendingPattern] = useState('*');

  const initialStateRef = useRef<Record<string, unknown> | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const isNewAgent = !selectedAgentName || (agentDraft !== null && agents.every(a => a.name !== selectedAgentName));
  const selectedAgent = agents.find(a => a.name === selectedAgentName);

  useEffect(() => {
    if (!selectedAgentName && !agentDraft) return;

    setPendingPermName('');
    setPendingPattern('*');

    const loadFromRules = (rules: PermissionRule[]) => {
      const normalized = normalizeRuleset(rules);
      const global = getGlobalWildcardAction(normalized);
      setGlobalPermission(global);
      setPermissionRules(normalized.filter(r => !(r.permission === '*' && r.pattern === '*')));
    };

    if (agentDraft) {
      const n = agentDraft.name || '';
      const s = agentDraft.scope || 'user';
      const d = agentDraft.description || '';
      const m = agentDraft.mode || 'subagent';
      const mdl = agentDraft.model || '';
      const t = agentDraft.temperature;
      const tp = agentDraft.top_p;
      const p = agentDraft.prompt || '';

      setDraftName(n);
      setDraftScope(s);
      setDescription(d);
      setMode(m as 'primary' | 'subagent' | 'all');
      setModel(mdl as string);
      setTemperature(t);
      setTopP(tp);
      setPrompt(p);
      loadFromRules(permissionConfigToRuleset(agentDraft.permission));

      initialStateRef.current = { draftName: n, draftScope: s, description: d, mode: m, model: mdl, temperature: t, topP: tp, prompt: p, globalPermission: 'ask', permissionRules: '' };
      return;
    }

    if (selectedAgent) {
      setDraftName('');
      setDraftScope(selectedAgent.scope || 'user');
      setDescription(selectedAgent.description || '');
      setMode((selectedAgent.mode as 'primary' | 'subagent' | 'all') || 'subagent');
      setModel(
        selectedAgent.model && typeof selectedAgent.model === 'object' && 'providerID' in selectedAgent.model && 'modelID' in selectedAgent.model
          ? `${selectedAgent.model.providerID}/${selectedAgent.model.modelID}`
          : typeof selectedAgent.model === 'string' ? selectedAgent.model : ''
      );
      setTemperature(selectedAgent.temperature);
      setTopP(selectedAgent.topP);
      setPrompt(selectedAgent.prompt || '');
      loadFromRules(permissionConfigToRuleset(selectedAgent.permission));

      initialStateRef.current = { description: selectedAgent.description, mode: selectedAgent.mode, model: selectedAgent.model, temperature: selectedAgent.temperature, topP: selectedAgent.topP, prompt: selectedAgent.prompt, globalPermission: 'ask', permissionRules: '' };
    }
  }, [selectedAgentName, agentDraft, selectedAgent]);

  const isDirty = useMemo(() => {
    const initial = initialStateRef.current;
    if (!initial) return false;
    if (isNewAgent) {
      if (draftName !== initial.draftName) return true;
      if (draftScope !== initial.draftScope) return true;
    }
    if (description !== initial.description) return true;
    if (mode !== initial.mode) return true;
    if (model !== initial.model) return true;
    if (temperature !== initial.temperature) return true;
    if (topP !== initial.topP) return true;
    if (prompt !== initial.prompt) return true;
    return false;
  }, [isNewAgent, draftName, draftScope, description, mode, model, temperature, topP, prompt]);

  const upsertRule = useCallback((permission: string, pattern: string, action: PermissionAction) => {
    setPermissionRules(prev => {
      const idx = prev.findIndex(r => r.permission === permission && r.pattern === pattern);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], action };
        return next;
      }
      return [...prev, { permission, pattern, action }];
    });
  }, []);

  const removeRule = useCallback((permission: string, pattern: string) => {
    setPermissionRules(prev => prev.filter(r => !(r.permission === permission && r.pattern === pattern)));
  }, []);

  const setGlobalAndPrune = useCallback((action: PermissionAction) => {
    setGlobalPermission(action);
    setPermissionRules(prev => prev.filter(r => !(r.permission === '*' && r.pattern === '*')));
  }, []);

  const getPermissionSummary = useCallback((permName: string) => {
    const globalRule = permissionRules.find(r => r.permission === permName && r.pattern === '*');
    const patternRules = permissionRules.filter(r => r.permission === permName && r.pattern !== '*');
    return {
      defaultAction: globalRule?.action ?? globalPermission,
      patternRules,
      hasOverride: !!globalRule,
    };
  }, [permissionRules, globalPermission]);

  const applyPendingRule = (action: PermissionAction) => {
    const name = pendingPermName.trim();
    if (!name) return;
    const pattern = pendingPattern.trim() || '*';
    if (name === '*' && pattern === '*') {
      setGlobalAndPrune(action);
    } else {
      upsertRule(name, pattern, action);
    }
    setPendingPermName('');
    setPendingPattern('*');
  };

  const buildConfig = useCallback((): Partial<AgentConfig> => {
    const allRules: PermissionRule[] = [...permissionRules];
    allRules.unshift({ permission: '*', pattern: '*', action: globalPermission });
    const permissionConfig = rulesetToPermissionConfig(allRules);
    return {
      description: description.trim() || undefined,
      mode,
      model: model.trim() || null,
      temperature,
      top_p: topP,
      prompt: prompt.trim() || undefined,
      permission: permissionConfig ?? null,
    };
  }, [description, mode, model, temperature, topP, prompt, permissionRules, globalPermission]);

  const handleSave = async () => {
    const agentName = isNewAgent ? draftName.trim().replace(/\s+/g, '-') : selectedAgentName?.trim();
    if (!agentName) return;

    if (isNewAgent && agents.some(a => a.name === agentName)) return;

    const config = buildConfig();

    let success: boolean;
    if (isNewAgent) {
      success = await createAgent({ name: agentName, scope: draftScope, ...config } as AgentConfig);
      if (success) setAgentDraft(null);
    } else {
      success = await updateAgent(agentName, { scope: draftScope, ...config });
    }
  };

  if (!selectedAgentName && !agentDraft) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-4)' }}>
          <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.4 }}>⚙</div>
          <p style={{ fontSize: 14, margin: '0 0 4px' }}>Select an agent</p>
          <p style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>Choose an agent from the sidebar or create a new one</p>
        </div>
      </div>
    );
  }

  const SECTION_STYLE: React.CSSProperties = {
    marginBottom: 24,
  };
  const SECTION_TITLE_STYLE: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: 8,
    padding: '0 4px',
  };
  const FIELD_ROW_STYLE: React.CSSProperties = {
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: isMobile ? 'stretch' : 'center',
    gap: isMobile ? 4 : 12,
    padding: '6px 8px',
  };
  const FIELD_LABEL_STYLE: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--text-3)',
    minWidth: isMobile ? 0 : 100,
    flexShrink: 0,
  };
  const FIELD_VALUE_STYLE: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const summaryPermissions = STANDARD_PERMISSION_KEYS.filter(k => k !== '*');

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: isMobile ? '12px' : '20px 24px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {isNewAgent ? 'New Agent' : selectedAgentName}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-4)', margin: '2px 0 0' }}>
              {isNewAgent ? 'Configure a new custom agent' : 'Edit agent configuration'}
            </p>
          </div>
        </div>

        {/* Identity & Role */}
        <div style={SECTION_STYLE}>
          <h3 style={SECTION_TITLE_STYLE}>Identity & Role</h3>
          <div style={{ background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)', padding: '8px 0' }}>
            {isNewAgent && (
              <div style={FIELD_ROW_STYLE}>
                <span style={FIELD_LABEL_STYLE}>Name</span>
                <div style={FIELD_VALUE_STYLE}>
                  <span style={{ fontSize: 12, color: 'var(--text-4)', marginRight: 2 }}>@</span>
                  <input
                    value={draftName}
                    onChange={e => setDraftName(e.target.value)}
                    placeholder="agent-name"
                    style={{ ...INPUT_STYLE, width: 160 }}
                  />
                  <select
                    value={draftScope}
                    onChange={e => setDraftScope(e.target.value as AgentScope)}
                    style={SELECT_STYLE}
                  >
                    <option value="user">User (global)</option>
                    <option value="project">Project</option>
                  </select>
                </div>
              </div>
            )}
            <div style={FIELD_ROW_STYLE}>
              <span style={FIELD_LABEL_STYLE}>Description</span>
              <div style={FIELD_VALUE_STYLE}>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What this agent does..."
                  style={INPUT_STYLE}
                />
              </div>
            </div>
            <div style={FIELD_ROW_STYLE}>
              <span style={FIELD_LABEL_STYLE}>Mode</span>
              <div style={{ ...FIELD_VALUE_STYLE, gap: 4 }}>
                {(['primary', 'subagent', 'all'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      ...BTN_STYLE,
                      background: mode === m ? 'var(--accent)' : 'transparent',
                      color: mode === m ? 'white' : 'var(--text-3)',
                      border: mode === m ? 'none' : '1px solid var(--border)',
                      fontSize: 11,
                      padding: '3px 10px',
                    }}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Model & Parameters */}
        <div style={SECTION_STYLE}>
          <h3 style={SECTION_TITLE_STYLE}>Model & Parameters</h3>
          <div style={{ background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)', padding: '8px 0' }}>
            <div style={FIELD_ROW_STYLE}>
              <span style={FIELD_LABEL_STYLE}>Override Model</span>
              <div style={FIELD_VALUE_STYLE}>
                <input
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="e.g. anthropic/claude-sonnet-4-20250514"
                  style={INPUT_STYLE}
                />
              </div>
            </div>
            <div style={FIELD_ROW_STYLE}>
              <span style={FIELD_LABEL_STYLE}>Temperature</span>
              <div style={FIELD_VALUE_STYLE}>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={temperature ?? 0.7}
                  onChange={e => setTemperature(parseFloat(e.target.value))}
                  style={{ flex: 1, maxWidth: 120 }}
                />
                <input
                  type="number"
                  value={temperature ?? ''}
                  onChange={e => setTemperature(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="0.7"
                  min={0}
                  max={2}
                  step={0.1}
                  style={{ ...INPUT_STYLE, width: 60, textAlign: 'center' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>0 – 2</span>
                {temperature !== undefined && (
                  <button
                    onClick={() => setTemperature(undefined)}
                    style={{ ...BTN_STYLE, background: 'transparent', color: 'var(--text-4)', padding: '2px 6px', fontSize: 13 }}
                    title="Reset to default"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div style={FIELD_ROW_STYLE}>
              <span style={FIELD_LABEL_STYLE}>Top P</span>
              <div style={FIELD_VALUE_STYLE}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={topP ?? 0.9}
                  onChange={e => setTopP(parseFloat(e.target.value))}
                  style={{ flex: 1, maxWidth: 120 }}
                />
                <input
                  type="number"
                  value={topP ?? ''}
                  onChange={e => setTopP(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="0.9"
                  min={0}
                  max={1}
                  step={0.1}
                  style={{ ...INPUT_STYLE, width: 60, textAlign: 'center' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>0 – 1</span>
                {topP !== undefined && (
                  <button
                    onClick={() => setTopP(undefined)}
                    style={{ ...BTN_STYLE, background: 'transparent', color: 'var(--text-4)', padding: '2px 6px', fontSize: 13 }}
                    title="Reset to default"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* System Prompt */}
        <div style={SECTION_STYLE}>
          <h3 style={SECTION_TITLE_STYLE}>System Prompt</h3>
          <div style={{ background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)', padding: 8 }}>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Instructions for this agent..."
              rows={8}
              style={{
                ...INPUT_STYLE,
                resize: 'vertical',
                minHeight: 100,
                maxHeight: '40vh',
                fontFamily: 'monospace',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            />
          </div>
        </div>

        {/* Tool Permissions */}
        <div style={SECTION_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Tool Permissions</h3>
            <button
              onClick={() => setShowAdvancedPermissions(p => !p)}
              style={{ ...BTN_STYLE, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 11 }}
            >
              {showAdvancedPermissions ? 'Simple View' : 'Advanced Editor'}
            </button>
          </div>

          {!showAdvancedPermissions ? (
            <div style={{ background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)', padding: '4px 0' }}>
              {summaryPermissions.map((permName, idx) => {
                const { defaultAction, patternRules } = getPermissionSummary(permName);
                const label = formatPermissionLabel(permName);
                return (
                  <div key={permName} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 12px',
                    borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace' }}>{permName}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {patternRules.length > 0 ? (
                        <span style={{
                          fontSize: 10, color: 'var(--text-4)',
                          background: 'var(--bg)', padding: '2px 6px', borderRadius: 3,
                        }}>
                          {patternRules.length} pattern{patternRules.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 3,
                          color: actionColor(defaultAction),
                          background: `${actionColor(defaultAction)}15`,
                          textTransform: 'capitalize', fontWeight: 500,
                        }}>
                          {defaultAction}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Global default */}
              <div style={{
                background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)',
                padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>Global Default</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-4)' }}>*</span>
                </div>
                <select
                  value={globalPermission}
                  onChange={e => setGlobalAndPrune(e.target.value as PermissionAction)}
                  style={SELECT_STYLE}
                >
                  <option value="allow">Allow</option>
                  <option value="ask">Ask</option>
                  <option value="deny">Deny</option>
                </select>
              </div>

              {/* Per-permission overrides */}
              {summaryPermissions.map(permName => {
                const { defaultAction, patternRules, hasOverride } = getPermissionSummary(permName);
                const label = formatPermissionLabel(permName);
                const wildcardOpts = (['allow', 'ask', 'deny'] as const).filter(a => a !== globalPermission);

                return (
                  <div key={permName} style={{
                    background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)',
                    padding: '10px 12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{label}</span>
                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-4)' }}>{permName}</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
                        default: <span style={{ color: actionColor(defaultAction), textTransform: 'capitalize' }}>{defaultAction}</span>
                      </span>
                    </div>

                    {/* Wildcard override */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 4px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>*</span>
                        {hasOverride && (
                          <button
                            onClick={() => removeRule(permName, '*')}
                            style={{ ...BTN_STYLE, background: 'transparent', color: 'var(--text-4)', padding: '1px 4px', fontSize: 12, lineHeight: 1 }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <select
                        value={hasOverride ? defaultAction : 'global'}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === 'global') {
                            removeRule(permName, '*');
                          } else {
                            upsertRule(permName, '*', v as PermissionAction);
                          }
                        }}
                        style={SELECT_STYLE}
                      >
                        <option value="global">Global</option>
                        {wildcardOpts.map(a => (
                          <option key={a} value={a} style={{ textTransform: 'capitalize' }}>{permissionActionLabel(a)}</option>
                        ))}
                      </select>
                    </div>

                    {/* Pattern rules */}
                    {patternRules.filter(r => r.pattern !== '*').map(rule => (
                      <div key={`${rule.permission}::${rule.pattern}`} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '4px 0 4px 8px', borderTop: '1px solid var(--border)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>pattern:</span>
                          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text)' }}>{rule.pattern}</span>
                          <button
                            onClick={() => removeRule(rule.permission, rule.pattern)}
                            style={{ ...BTN_STYLE, background: 'transparent', color: 'var(--text-4)', padding: '1px 4px', fontSize: 12, lineHeight: 1 }}
                          >
                            ✕
                          </button>
                        </div>
                        <select
                          value={rule.action}
                          onChange={e => upsertRule(rule.permission, rule.pattern, e.target.value as PermissionAction)}
                          style={SELECT_STYLE}
                        >
                          <option value="allow">Allow</option>
                          <option value="ask">Ask</option>
                          <option value="deny">Deny</option>
                        </select>
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Add custom rule */}
              <div style={{
                background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)',
                padding: '12px',
              }}>
                <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>Add Custom Rule</h4>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={pendingPermName}
                    onChange={e => setPendingPermName(e.target.value)}
                    style={{ ...SELECT_STYLE, flex: '0 0 130px' }}
                  >
                    <option value="">Permission...</option>
                    {STANDARD_PERMISSION_KEYS.filter(k => k !== '*').map(k => (
                      <option key={k} value={k}>{formatPermissionLabel(k)}</option>
                    ))}
                  </select>
                  <input
                    value={pendingPattern}
                    onChange={e => setPendingPattern(e.target.value)}
                    placeholder="pattern (e.g. *.ts)"
                    style={{ ...INPUT_STYLE, flex: 1, minWidth: 100, fontFamily: 'monospace', fontSize: 11 }}
                  />
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['allow', 'ask', 'deny'] as const).map(a => (
                      <button
                        key={a}
                        onClick={() => applyPendingRule(a)}
                        style={{
                          ...BTN_STYLE,
                          padding: '4px 8px',
                          fontSize: 11,
                          background: 'transparent',
                          border: `1px solid var(--border)`,
                          color: actionColor(a),
                          fontWeight: 600,
                        }}
                      >
                        {permissionActionLabel(a)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save button */}
        <div style={{ padding: '4px 0' }}>
          <button
            onClick={handleSave}
            disabled={isSaving || (!isDirty && !isNewAgent)}
            style={{
              ...BTN_STYLE,
              padding: '6px 16px',
              background: 'var(--accent)',
              color: 'white',
              opacity: isSaving || (!isDirty && !isNewAgent) ? 0.5 : 1,
              cursor: isSaving || (!isDirty && !isNewAgent) ? 'not-allowed' : 'pointer',
            }}
          >
            {isSaving ? 'Saving...' : isNewAgent ? 'Create Agent' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

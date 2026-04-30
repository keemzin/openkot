export const LS_THEME = 'oc_theme';

export type ThemeId = string;

export type ThemeDef = { name: string; variant: 'dark' | 'light'; vars: Record<string, string> };

export const THEME_DEFS: Record<string, ThemeDef> = {
  // ── Flexoki ────────────────────────────────────────────────────────────────
  'flexoki-dark': { name: 'Flexoki', variant: 'dark', vars: {
    '--bg': '#151313', '--bg-2': '#1C1B1A', '--bg-3': '#1c1a19', '--bg-4': '#1e1d1c', '--bg-5': '#343331',
    '--border': '#343331', '--border-2': '#403E3C',
    '--text': '#CECDC3', '--text-2': '#CECDC3', '--text-3': '#807e79', '--text-4': '#575653', '--text-5': '#403E3C',
    '--accent': '#DA702C', '--accent-dim': 'rgba(218,112,44,0.15)',
    '--green': '#879A39', '--red': '#D14D41', '--blue': '#4385BE', '--orange': '#DA702C', '--shadow': 'rgba(0,0,0,0.6)',
  }},
  'flexoki-light': { name: 'Flexoki', variant: 'light', vars: {
    '--bg': '#FFFCF0', '--bg-2': '#F2F0E5', '--bg-3': '#fdf6ec', '--bg-4': '#F6F0E6', '--bg-5': '#DAD8CE',
    '--border': '#DAD8CE', '--border-2': '#CECDC3',
    '--text': '#100F0F', '--text-2': '#100F0F', '--text-3': '#686663', '--text-4': '#6F6E69', '--text-5': '#B7B5AC',
    '--accent': '#BC5215', '--accent-dim': 'rgba(188,82,21,0.12)',
    '--green': '#66800B', '--red': '#AF3029', '--blue': '#205EA6', '--orange': '#BC5215', '--shadow': 'rgba(0,0,0,0.12)',
  }},
  // ── Tokyo Night ────────────────────────────────────────────────────────────
  'tokyonight-dark': { name: 'Tokyo Night', variant: 'dark', vars: {
    '--bg': '#0F111A', '--bg-2': '#111428', '--bg-3': '#131629', '--bg-4': '#171b30', '--bg-5': '#31344a',
    '--border': '#31344a', '--border-2': '#292C43',
    '--text': '#C0CAF5', '--text-2': '#C0CAF5', '--text-3': '#6a739d', '--text-4': '#45496F', '--text-5': '#343755',
    '--accent': '#7AA2F7', '--accent-dim': 'rgba(122,162,247,0.15)',
    '--green': '#9ECE6A', '--red': '#F7768E', '--blue': '#7DCFFF', '--orange': '#E0AF68', '--shadow': 'rgba(0,0,0,0.6)',
  }},
  'tokyonight-light': { name: 'Tokyo Night', variant: 'light', vars: {
    '--bg': '#E1E2E7', '--bg-2': '#DEE0EA', '--bg-3': '#dee0ee', '--bg-4': '#dadce6', '--bg-5': '#bbbdc9',
    '--border': '#bbbdc9', '--border-2': '#C3C6D2',
    '--text': '#273153', '--text-2': '#273153', '--text-3': '#686e9b', '--text-4': '#5C6390', '--text-5': '#9FA3BC',
    '--accent': '#2E7DE9', '--accent-dim': 'rgba(46,125,233,0.12)',
    '--green': '#587539', '--red': '#C94060', '--blue': '#007197', '--orange': '#8C6C3E', '--shadow': 'rgba(0,0,0,0.12)',
  }},
  // ── Nord ───────────────────────────────────────────────────────────────────
  'nord-dark': { name: 'Nord', variant: 'dark', vars: {
    '--bg': '#1F2430', '--bg-2': '#222938', '--bg-3': '#1C202A', '--bg-4': '#272f40', '--bg-5': '#414755',
    '--border': '#414755', '--border-2': '#383F50',
    '--text': '#E5E9F0', '--text-2': '#E5E9F0', '--text-3': '#7c828e', '--text-4': '#545B78', '--text-5': '#434A62',
    '--accent': '#88C0D0', '--accent-dim': 'rgba(136,192,208,0.15)',
    '--green': '#A3BE8C', '--red': '#BF616A', '--blue': '#81A1C1', '--orange': '#D08770', '--shadow': 'rgba(0,0,0,0.5)',
  }},
  'nord-light': { name: 'Nord', variant: 'light', vars: {
    '--bg': '#ECEFF4', '--bg-2': '#E4E8F0', '--bg-3': '#e7ebf5', '--bg-4': '#dee4f0', '--bg-5': '#c5cbd6',
    '--border': '#c5cbd6', '--border-2': '#C9D0DE',
    '--text': '#2E3440', '--text-2': '#2E3440', '--text-3': '#6e7481', '--text-4': '#4C566A', '--text-5': '#B2BACC',
    '--accent': '#5E81AC', '--accent-dim': 'rgba(94,129,172,0.12)',
    '--green': '#8FBCBB', '--red': '#BF616A', '--blue': '#81A1C1', '--orange': '#D08770', '--shadow': 'rgba(0,0,0,0.1)',
  }},
  // ── Catppuccin ─────────────────────────────────────────────────────────────
  'catppuccin-dark': { name: 'Catppuccin', variant: 'dark', vars: {
    '--bg': '#1E1E2E', '--bg-2': '#211F31', '--bg-3': '#282841', '--bg-4': '#2f2f50', '--bg-5': '#35324A',
    '--border': '#35324A', '--border-2': '#393655',
    '--text': '#CDD6F4', '--text-2': '#CDD6F4', '--text-3': '#969cb1', '--text-4': '#575379', '--text-5': '#47436D',
    '--accent': '#B4BEFE', '--accent-dim': 'rgba(180,190,254,0.15)',
    '--green': '#A6E3A1', '--red': '#F38BA8', '--blue': '#89DCEB', '--orange': '#F9E2AF', '--shadow': 'rgba(0,0,0,0.6)',
  }},
  'catppuccin-light': { name: 'Catppuccin', variant: 'light', vars: {
    '--bg': '#fff6f4', '--bg-2': '#F2D8D4', '--bg-3': '#fbefea', '--bg-4': '#FDEEEE', '--bg-5': '#E0CFD3',
    '--border': '#E0CFD3', '--border-2': '#D6C4C8',
    '--text': '#2e314a', '--text-2': '#4C4F69', '--text-3': '#888992', '--text-4': '#6C6F85', '--text-5': '#C2AEB4',
    '--accent': '#7287FD', '--accent-dim': 'rgba(114,135,253,0.12)',
    '--green': '#40A02B', '--red': '#D20F39', '--blue': '#04A5E5', '--orange': '#DF8E1D', '--shadow': 'rgba(0,0,0,0.1)',
  }},
  // ── Dracula ────────────────────────────────────────────────────────────────
  'dracula-dark': { name: 'Dracula', variant: 'dark', vars: {
    '--bg': '#14151F', '--bg-2': '#181926', '--bg-3': '#161722', '--bg-4': '#222436', '--bg-5': '#2D2F3C',
    '--border': '#2D2F3C', '--border-2': '#303244',
    '--text': '#F8F8F2', '--text-2': '#F8F8F2', '--text-3': '#7c7e9c', '--text-4': '#4A4D6D', '--text-5': '#3B3D55',
    '--accent': '#BD93F9', '--accent-dim': 'rgba(189,147,249,0.15)',
    '--green': '#50FA7B', '--red': '#FF5555', '--blue': '#8BE9FD', '--orange': '#FFB86C', '--shadow': 'rgba(0,0,0,0.7)',
  }},
  // ── Solarized ──────────────────────────────────────────────────────────────
  'solarized-dark': { name: 'Solarized', variant: 'dark', vars: {
    '--bg': '#001e25', '--bg-2': '#022733', '--bg-3': '#052832', '--bg-4': '#042b34', '--bg-5': '#253f47',
    '--border': '#253f47', '--border-2': '#243E47',
    '--text': '#93A1A1', '--text-2': '#93A1A1', '--text-3': '#6f7475', '--text-4': '#3A5A6B', '--text-5': '#2D4958',
    '--accent': '#268BD2', '--accent-dim': 'rgba(38,139,210,0.15)',
    '--green': '#859900', '--red': '#DC322F', '--blue': '#2AA198', '--orange': '#B58900', '--shadow': 'rgba(0,0,0,0.6)',
  }},
  'solarized-light': { name: 'Solarized', variant: 'light', vars: {
    '--bg': '#FDF6E3', '--bg-2': '#F6EFDA', '--bg-3': '#FAF3DC', '--bg-4': '#F6EFDA', '--bg-5': '#e0decc',
    '--border': '#e0decc', '--border-2': '#D9D4C2',
    '--text': '#586E75', '--text-2': '#586E75', '--text-3': '#7a8587', '--text-4': '#7A8C8E', '--text-5': '#C5C0AD',
    '--accent': '#268BD2', '--accent-dim': 'rgba(38,139,210,0.12)',
    '--green': '#859900', '--red': '#DC322F', '--blue': '#2AA198', '--orange': '#B58900', '--shadow': 'rgba(0,0,0,0.1)',
  }},
};

export const THEME_COMPAT: Record<string, string> = { dark: 'flexoki-dark', light: 'flexoki-light' };

export const THEMES: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(THEME_DEFS).map(([id, def]) => [id, def.vars])
);

export function applyTheme(id: ThemeId) {
  const resolved = THEME_COMPAT[id] ?? id;
  const vars = THEMES[resolved];
  if (!vars) return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.setAttribute('data-theme', resolved);
  localStorage.setItem(LS_THEME, resolved);
  const variant = THEME_DEFS[resolved]?.variant ?? 'dark';
  root.classList.toggle('theme-light', variant === 'light');
  root.classList.toggle('theme-dark', variant === 'dark');
}

export function loadTheme(): ThemeId {
  const saved = localStorage.getItem(LS_THEME);
  if (saved && (THEMES[saved] || THEME_COMPAT[saved])) return saved;
  return 'flexoki-dark';
}

applyTheme(loadTheme());
export const LS_THEME = 'oc_theme';

export type ThemeId = string;

export type ThemeDef = { name: string; variant: 'dark' | 'light'; vars: Record<string, string> };

export const THEME_DEFS: Record<string, ThemeDef> = {
  'flexoki-dark': { name: 'Flexoki', variant: 'dark', vars: {
    '--bg': '#151313', '--bg-2': '#1a1818', '--bg-3': '#1e1c1c', '--bg-4': '#252323', '--bg-5': '#2a2828',
    '--border': '#2a2828', '--border-2': '#3a3838',
    '--text': '#FFFCF0', '--text-2': '#CECDC3', '--text-3': '#878580', '--text-4': '#575653', '--text-5': '#444',
    '--accent': '#DA702C', '--accent-dim': 'rgba(218,112,44,0.15)',
    '--green': '#879A39', '--red': '#D14D41', '--blue': '#4385BE', '--orange': '#DA702C', '--shadow': 'rgba(0,0,0,0.6)',
  }},
  'flexoki-light': { name: 'Flexoki', variant: 'light', vars: {
    '--bg': '#FFFCF0', '--bg-2': '#F2F0E8', '--bg-3': '#E6E4D9', '--bg-4': '#DAD8CE', '--bg-5': '#CECDC3',
    '--border': '#DAD8CE', '--border-2': '#CECDC3',
    '--text': '#100F0F', '--text-2': '#1C1B1A', '--text-3': '#6F6E69', '--text-4': '#878580', '--text-5': '#B7B5AC',
    '--accent': '#BC5215', '--accent-dim': 'rgba(188,82,21,0.12)',
    '--green': '#66800B', '--red': '#AF3029', '--blue': '#205EA6', '--orange': '#BC5215', '--shadow': 'rgba(0,0,0,0.12)',
  }},
  'tokyonight-dark': { name: 'Tokyo Night', variant: 'dark', vars: {
    '--bg': '#1a1b26', '--bg-2': '#1f2335', '--bg-3': '#24283b', '--bg-4': '#2a2e3f', '--bg-5': '#32374d',
    '--border': '#2a2e3f', '--border-2': '#3b4261',
    '--text': '#c0caf5', '--text-2': '#a9b1d6', '--text-3': '#787c99', '--text-4': '#565f89', '--text-5': '#414868',
    '--accent': '#7aa2f7', '--accent-dim': 'rgba(122,162,247,0.15)',
    '--green': '#9ece6a', '--red': '#f7768e', '--blue': '#7aa2f7', '--orange': '#ff9e64', '--shadow': 'rgba(0,0,0,0.6)',
  }},
  'tokyonight-light': { name: 'Tokyo Night', variant: 'light', vars: {
    '--bg': '#d5d6db', '--bg-2': '#cbccd1', '--bg-3': '#c0c1c7', '--bg-4': '#b5b6bc', '--bg-5': '#a8a9b0',
    '--border': '#b5b6bc', '--border-2': '#a8a9b0',
    '--text': '#343b58', '--text-2': '#3760bf', '--text-3': '#6172b0', '--text-4': '#8990b3', '--text-5': '#a8aecb',
    '--accent': '#2e7de9', '--accent-dim': 'rgba(46,125,233,0.12)',
    '--green': '#587539', '--red': '#f52a65', '--blue': '#2e7de9', '--orange': '#b15c00', '--shadow': 'rgba(0,0,0,0.12)',
  }},
  'nord-dark': { name: 'Nord', variant: 'dark', vars: {
    '--bg': '#2e3440', '--bg-2': '#3b4252', '--bg-3': '#434c5e', '--bg-4': '#4c566a', '--bg-5': '#575f6e',
    '--border': '#3b4252', '--border-2': '#4c566a',
    '--text': '#eceff4', '--text-2': '#e5e9f0', '--text-3': '#d8dee9', '--text-4': '#adb5c7', '--text-5': '#7b88a1',
    '--accent': '#88c0d0', '--accent-dim': 'rgba(136,192,208,0.15)',
    '--green': '#a3be8c', '--red': '#bf616a', '--blue': '#81a1c1', '--orange': '#d08770', '--shadow': 'rgba(0,0,0,0.5)',
  }},
  'nord-light': { name: 'Nord', variant: 'light', vars: {
    '--bg': '#eceff4', '--bg-2': '#e5e9f0', '--bg-3': '#d8dee9', '--bg-4': '#cdd3de', '--bg-5': '#c0c8d8',
    '--border': '#d8dee9', '--border-2': '#adb5c7',
    '--text': '#2e3440', '--text-2': '#3b4252', '--text-3': '#4c566a', '--text-4': '#7b88a1', '--text-5': '#adb5c7',
    '--accent': '#5e81ac', '--accent-dim': 'rgba(94,129,172,0.12)',
    '--green': '#a3be8c', '--red': '#bf616a', '--blue': '#5e81ac', '--orange': '#d08770', '--shadow': 'rgba(0,0,0,0.1)',
  }},
  'catppuccin-dark': { name: 'Catppuccin', variant: 'dark', vars: {
    '--bg': '#1e1e2e', '--bg-2': '#181825', '--bg-3': '#313244', '--bg-4': '#45475a', '--bg-5': '#585b70',
    '--border': '#313244', '--border-2': '#45475a',
    '--text': '#cdd6f4', '--text-2': '#bac2de', '--text-3': '#a6adc8', '--text-4': '#7f849c', '--text-5': '#6c7086',
    '--accent': '#cba6f7', '--accent-dim': 'rgba(203,166,247,0.15)',
    '--green': '#a6e3a1', '--red': '#f38ba8', '--blue': '#89b4fa', '--orange': '#fab387', '--shadow': 'rgba(0,0,0,0.6)',
  }},
  'catppuccin-light': { name: 'Catppuccin', variant: 'light', vars: {
    '--bg': '#eff1f5', '--bg-2': '#e6e9ef', '--bg-3': '#dce0e8', '--bg-4': '#ccd0da', '--bg-5': '#bcc0cc',
    '--border': '#dce0e8', '--border-2': '#bcc0cc',
    '--text': '#4c4f69', '--text-2': '#5c5f77', '--text-3': '#6c6f85', '--text-4': '#8c8fa1', '--text-5': '#acafbe',
    '--accent': '#8839ef', '--accent-dim': 'rgba(136,57,239,0.12)',
    '--green': '#40a02b', '--red': '#d20f39', '--blue': '#1e66f5', '--orange': '#fe640b', '--shadow': 'rgba(0,0,0,0.1)',
  }},
  'dracula-dark': { name: 'Dracula', variant: 'dark', vars: {
    '--bg': '#282a36', '--bg-2': '#21222c', '--bg-3': '#343746', '--bg-4': '#44475a', '--bg-5': '#4f5263',
    '--border': '#343746', '--border-2': '#44475a',
    '--text': '#f8f8f2', '--text-2': '#e2e2dc', '--text-3': '#b0b0a8', '--text-4': '#6272a4', '--text-5': '#4d5680',
    '--accent': '#bd93f9', '--accent-dim': 'rgba(189,147,249,0.15)',
    '--green': '#50fa7b', '--red': '#ff5555', '--blue': '#8be9fd', '--orange': '#ffb86c', '--shadow': 'rgba(0,0,0,0.6)',
  }},
  'solarized-dark': { name: 'Solarized', variant: 'dark', vars: {
    '--bg': '#002b36', '--bg-2': '#073642', '--bg-3': '#0d4050', '--bg-4': '#134a5a', '--bg-5': '#1a5464',
    '--border': '#073642', '--border-2': '#134a5a',
    '--text': '#fdf6e3', '--text-2': '#eee8d5', '--text-3': '#93a1a1', '--text-4': '#657b83', '--text-5': '#586e75',
    '--accent': '#268bd2', '--accent-dim': 'rgba(38,139,210,0.15)',
    '--green': '#859900', '--red': '#dc322f', '--blue': '#268bd2', '--orange': '#cb4b16', '--shadow': 'rgba(0,0,0,0.6)',
  }},
  'solarized-light': { name: 'Solarized', variant: 'light', vars: {
    '--bg': '#fdf6e3', '--bg-2': '#eee8d5', '--bg-3': '#e8e2ce', '--bg-4': '#ddd8c4', '--bg-5': '#d3cdb8',
    '--border': '#e8e2ce', '--border-2': '#c8c2ae',
    '--text': '#002b36', '--text-2': '#073642', '--text-3': '#586e75', '--text-4': '#657b83', '--text-5': '#839496',
    '--accent': '#268bd2', '--accent-dim': 'rgba(38,139,210,0.12)',
    '--green': '#859900', '--red': '#dc322f', '--blue': '#268bd2', '--orange': '#cb4b16', '--shadow': 'rgba(0,0,0,0.1)',
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
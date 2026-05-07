---
name: OpenKot
description: A playful, multi-device AI chat interface with agentic superpowers
colors:
  bg: "#0F111A"
  bg-2: "#111428"
  bg-3: "#131629"
  bg-4: "#171b30"
  bg-5: "#31344a"
  border: "#31344a"
  border-2: "#292C43"
  text: "#C0CAF5"
  text-2: "#C0CAF5"
  text-3: "#6a739d"
  text-4: "#45496F"
  text-5: "#343755"
  accent: "#7AA2F7"
  accent-dim: "rgba(122,162,247,0.15)"
  green: "#9ECE6A"
  red: "#F7768E"
  blue: "#7DCFFF"
  orange: "#E0AF68"
  shadow: "rgba(0,0,0,0.6)"
typography:
  display:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif, 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'"
    fontSize: "clamp(1.5rem, 4vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "'IBM Plex Mono', 'Consolas', 'Courier New', monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
  mono:
    fontFamily: "'IBM Plex Mono', 'Consolas', 'Courier New', monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  sm: "3px"
  md: "6px"
  lg: "8px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.bg}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    typography: "{typography.label}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    typography: "{typography.label}"
  button-ghost-hover:
    backgroundColor: "{colors.bg-3}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    typography: "{typography.label}"
  card-tool:
    backgroundColor: "{colors.bg-2}"
    borderRadius: "{rounded.md}"
    padding: "0"
    border: "1px solid {colors.border}"
  input-search:
    backgroundColor: "{colors.bg-3}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
    typography: "{typography.mono}"
---

# Design System: OpenKot

## 1. Overview

**Creative North Star: "The Living Terminal"**

A spunky terminal-inspired chat interface that feels alive. OpenKot is where playful experimentation meets agentic AI — the terminal isn't just a panel, it's a personality. Micro-interactions, smooth transitions, and tactile feedback make every tap feel deliberate. The design rejects the sterile "AI wrapper" aesthetic in favor of something that feels hand-crafted, inviting, and unpretentious.

This system explicitly rejects generic AI wrapper tropes: no glassmorphism, no gradient text, no hero metrics with big numbers. It also avoids corporate SaaS darkness (navy blue, cards everywhere) and hacker/cyberpunk neon-on-black overload. Instead, it draws from cool tech dark themes (Tokyo Night, Nord) — blues and slate tones that feel like a focused night-coding session.

**Key Characteristics:**
- Chat-first, not tool-first — conversation is the hero
- Multi-device parity — desktop and mobile get equal design attention
- Tactile and confident — clear surfaces, visible borders, distinct interactive states
- Spunky personality — micro-interactions and delight in small details
- Cool tech dark — blues and slate, never navy corporate or neon hacker

## 2. Colors: The Cool Tech Dark Palette

The system uses cool blues and slate tones inspired by Tokyo Night and Nord themes. The default is "Cool Tech Dark" — a night-coding aesthetic that feels focused, not fatiguing.

### Primary

- **Electric Blue** (#7AA2F7): The accent color. Used for primary actions, active states, links, and keyword highlights in code. Deliberate and confident, never shy.

### Secondary

- **Sky Blue** (#7DCFFF): Supporting accent for hover states and secondary actions. Slightly brighter than primary, used to create depth.

### Neutral

- **Void Black** (#0F111A): Root background. The deepest layer, feels like a terminal window at midnight.
- **Midnight** (#111428): Secondary background for panels and elevated surfaces.
- **Deep Slate** (#131629): Tertiary background for tool cards, code blocks, input surfaces.
- **Blue Grey** (#171b30): Quaternary background for hover states and subtle layering.
- **Slate Border** (#31344a): Border color, visible but not heavy.

### Text

- **Bright Lavender** (#C0CAF5): Primary text, high contrast against dark backgrounds.
- **Muted Lavender** (#6a739d): Secondary text, labels, descriptions.
- **Dim Slate** (#45496F): Tertiary text, placeholders, disabled states.
- **Deep Indigo** (#343755): Quaternary text, subtle metadata.

### Semantic Colors

- **Vivid Green** (#9ECE6A): Success states, added lines in diffs, positive indicators.
- **Coral Red** (#F7768E): Error states, removed lines in diffs, destructive actions.
- **Warm Orange** (#E0AF68): Warning states, modified indicators, attention without danger.

### Named Rules

**The Chat-First Rule.** The accent color (Electric Blue) is used on ≤15% of any given screen. Its rarity is the point — when it appears, it means something. Overusing it makes the interface feel like a generic AI wrapper.

**The No-Gradient Rule.** No gradient text, no gradient backgrounds, no gradient borders. Solid colors only. If depth is needed, use tonal layering (bg-2, bg-3) or shadows.

## 3. Typography

**Display Font:** IBM Plex Sans (with system-ui, -apple-system, sans-serif fallbacks)
**Body Font:** IBM Plex Sans (with system-ui fallbacks)
**Label/Mono Font:** IBM Plex Mono (with Consolas, Courier New, monospace fallbacks)

**Character:** Warm humanist sans for UI, technical mono for code and data. The pairing feels approachable (IBM Plex's warmth) but competent (mono's precision). Never cold or corporate.

### Hierarchy

- **Display** (600 weight, clamp(1.5rem, 4vw, 2.5rem), 1.2 line-height): Chat message headings, section dividers, empty state headlines.
- **Body** (400 weight, 15px, 1.6 line-height): Primary UI text, chat messages, descriptions. Max line length in prose: 65-75ch.
- **Label** (500 weight, 12px, 0.02em letter-spacing): Buttons, labels, metadata, timestamps. Slightly tracked out for clarity.
- **Mono** (400 weight, 13px, 1.6 line-height): Code blocks, terminal output, file paths, technical data. Wraps at natural breakpoints.

### Named Rules

**The Mono-For-Data Rule.** Any technical content (code, paths, terminal, diffs) uses IBM Plex Mono. Any conversational content uses IBM Plex Sans. No exceptions — mixing sans into code or mono into chat breaks the personality.

**The 15px Body Rule.** Body text is always 15px, never 14px (too small for mobile) or 16px (too large for code-dense panels). This size works across desktop and mobile without scaling.

## 4. Elevation

This system uses tonal layering (not shadows) for elevation. Surfaces are flat at rest — bg (root), bg-2 (panels), bg-3 (cards/tools), bg-4 (hover). Shadows only appear as a response to state (active modals, drag states), and even then they're subtle (rgba(0,0,0,0.6)).

### Shadow Vocabulary

- **Ambient Modal** (`box-shadow: 0 8px 32px rgba(0,0,0,0.6)`): Modal dialogs, settings panels when opened.
- **Focus Glow** (`box-shadow: 0 0 0 2px var(--accent)`): Focus-visible states on inputs and interactive elements.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat until proven otherwise. Shadows appear only as a response to state (hover, elevation, focus). A card doesn't get a shadow just by existing.

**The Tonal-Over-Shadow Rule.** Depth is conveyed through background tonal steps (bg → bg-2 → bg-3), not shadows. This keeps the cool tech dark palette cohesive and avoids the "floating cards" SaaS look.

## 5. Components

### Buttons

- **Shape:** 6px radius (rounded-md), comfortable padding (8px 16px)
- **Primary:** Electric Blue background (#7AA2F7), Void Black text. Confident, impossible to miss.
- **Hover / Focus:** Sky Blue background (#7DCFFF), subtle scale feedback (transform: translateY(-1px) or equivalent micro-interaction).
- **Ghost:** Transparent background, muted lavender text. For secondary actions that don't need shouting.
- **Ghost Hover:** Deep Slate background (bg-3), bright lavender text.

### Chips / Tags

- **Style:** bg-3 background, muted lavender text, 6px radius, 6px 10px padding, mono font at 11px.
- **State:** Selected chips get accent background + void black text. Unselected stays tonal.

### Cards / Containers

- **Corner Style:** 8px radius (rounded-lg) for tool cards, 6px for inline containers.
- **Background:** bg-2 for panels, bg-3 for tool cards and code blocks.
- **Border:** 1px solid Slate Border (#31344a). Visible but not heavy.
- **Internal Padding:** 16px for panels, 0 for tool cards (they manage internal padding).

### Inputs / Fields

- **Style:** bg-3 background, bright lavender text, 6px radius, 1px solid border (matching border color), 6px 10px padding.
- **Focus:** 2px solid accent ring (no outline, no glow — just the border color shifting to accent).
- **Placeholder:** Dim Slate text (#45496F), italic.
- **Mono font** for technical inputs (search, paths), body font for conversational inputs.

### Navigation

- **Sidebar:** Fixed left (desktop) or bottom sheet (mobile). bg-2 background, border-right (desktop) or border-top (mobile).
- **Items:** 6px 10px padding, mono font at 12px, muted lavender text. Active item gets accent text + bg-3 background.
- **Hover:** bg-3 background, bright lavender text. No sliding indicators — color and background are enough.
- **Mobile:** Bottom sheet slides up, full-width. Tactile and thumb-friendly (min 44px touch targets).

### Chat Messages

- **Bubble Style:** No bubbles. Messages are flat, left-aligned, separated by 16px vertical spacing.
- **User Messages:** Bold label ("You"), body text, timestamp in muted lavender.
- **AI Messages:** Bold label ("AI"), body text with markdown rendering, tool trails collapsed below.
- **Tool Trail:** Collapsible group (tool-card component), shows running indicators, success/error states with semantic colors.

### Code Blocks

- **Style:** bg-3 background, 6px radius, 10px 12px padding, mono font at 13px, 1.6 line-height.
- **Syntax Highlighting:** Comments (text-4, italic), numbers/strings (green), keywords (accent), operators (blue), functions (blue).
- **Line Numbers:** Dim Slate (#45496F), right-aligned, mono 11px.

## 6. Do's and Don'ts

### Do:

- **Do** use Electric Blue (#7AA2F7) sparingly — it's an accent, not a brand wash.
- **Do** maintain 6px or 8px radius consistently — no mixing 4px and 12px on the same surface.
- **Do** use IBM Plex Mono for all code, paths, terminal output, and technical data.
- **Do** ensure touch targets are minimum 44px on mobile — buttons, nav items, chips.
- **Do** use tonal layering (bg → bg-2 → bg-3) to show depth, not shadows.
- **Do** keep chat messages flat and left-aligned — no speech bubbles, no avatar circles.
- **Do** make the chat the hero — tools, editors, and terminals support the conversation, never overshadow it.

### Don't:

- **Don't** use gradient text, gradient backgrounds, or gradient borders. Solid colors only.
- **Don't** use glassmorphism, blur effects, or semi-transparent surfaces. This isn't a generic AI wrapper.
- **Don't** use side-stripe borders (border-left greater than 1px) as colored accents. Use background tints or nothing.
- **Don't** create identical card grids (same-sized cards with icon + heading + text, repeated). Vary sizes or use lists.
- **Don't** use the hero-metric template (big number, small label, gradient accent). Chat is the hero, not metrics.
- **Don't** use em dashes (—) in any UI copy. Use commas, colons, semicolons, periods, or parentheses.
- **Don't** wrap everything in cards. Most things don't need one — use bg-2 or bg-3 directly.
- **Don't** use modal as first thought. Try inline expansion, progressive disclosure, or bottom sheet (mobile) first.
- **Don't** animate CSS layout properties (width, height, margin, padding). Use transforms or opacity only.
- **Don't** use bounce or elastic easing. Ease out with exponential curves (ease-out-quart/quint/expo) for state transitions.

// ─── FireSight Design System ───────────────────────────────────────────────
// Edit this file to change colors, typography, and spacing across the UI.
//
// STYLE GUIDE: Tactical Hardware Interface — matte black chassis, modular
// data cards, mono readouts, hazard-stripe alerts, tactile buttons.
// Think high-end fire command hardware, not a glass web app.

export const colors = {
  // Backgrounds — matte, solid, no transparency
  bg: '#0D0E10',
  bgPanel: '#111215',
  bgPanelHover: '#141519',
  bgInset: 'rgba(255, 255, 255, 0.03)',

  // Borders — white-tinted, extremely subtle
  border: 'rgba(255, 255, 255, 0.05)',
  borderSubtle: 'rgba(255, 255, 255, 0.03)',
  borderFocus: 'rgba(255, 255, 255, 0.10)',

  // Accent — desaturated blue, restrained
  accent: '#6EA8D7',
  accentDim: 'rgba(110, 168, 215, 0.10)',

  // Fire — the only vivid warm palette in the UI
  fireNow: '#FF4444',       // Danger Red
  fireOneHour: '#F27D26',   // Warning Orange
  fireThreeHour: '#E8B830',

  // Status
  safe: '#10B981',          // Active Emerald
  warning: '#F27D26',
  danger: '#FF4444',

  // Text — warm white primary, muted secondary
  text: '#D8DEE8',
  textSecondary: 'rgba(200, 210, 225, 0.50)',
  textTertiary: 'rgba(142, 146, 153, 0.60)',   // #8E9299 @ 60% — industrial silk-screen

  // Data values — max legibility mono readouts
  dataValue: '#E8EEF5',

  // Semantic color roles
  // neutral  → accent (#6EA8D7)   — environmental / terrain
  // warning  → fireOneHour        — elevated fire risk
  // critical → fireNow            — dangerous / emergency
};

export const typography = {
  // Inter for UI labels; JetBrains Mono for all data values & status codes
  sansFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  monoFamily: "'JetBrains Mono', 'SF Mono', monospace",

  sizes: {
    xs: '10px',
    sm: '11px',
    base: '12.5px',
    md: '14px',
    lg: '16px',
    xl: '20px',
    xxl: '26px',
  },

  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
  },

  // Micro-labels use `widest` to mimic silk-screened industrial equipment text
  letterSpacing: {
    tight: '-0.01em',
    normal: '0',
    wide: '0.04em',
    wider: '0.08em',
    widest: '0.14em',
  },
};

export const spacing = {
  xxs: '2px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
};

export const radii = {
  sm: '6px',
  base: '10px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  panel: '28px',   // Large rounded corners — hardware shell aesthetic
  full: '9999px',
};

export const shadows = {
  panel: '0 8px 32px rgba(0, 0, 0, 0.60)',
  panelInset: '0 1px 0 rgba(255, 255, 255, 0.02) inset',
  soft: '0 2px 12px rgba(0, 0, 0, 0.4)',

  // LED-style glows for status indicators and critical readouts
  glowCritical: '0 0 8px rgba(255, 68, 68, 0.45)',
  glowWarning:  '0 0 8px rgba(242, 125, 38, 0.40)',
  glowSafe:     '0 0 8px rgba(16, 185, 129, 0.40)',
  glowAccent:   '0 0 6px rgba(110, 168, 215, 0.30)',
};

// ─── Shared hardware panel ─────────────────────────────────────────────────
// Solid matte surface — no glass blur, no transparency
export const panelStyle = {
  background: colors.bgPanel,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.panel,
  boxShadow: `${shadows.panel}, ${shadows.panelInset}`,
};

// ─── Buttons ───────────────────────────────────────────────────────────────
// Tactile look: semi-transparent fill + brighter border + scale feedback
export const buttonBase = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  border: `1px solid ${colors.borderFocus}`,
  borderRadius: radii.sm,
  cursor: 'pointer',
  fontFamily: typography.sansFamily,
  fontWeight: typography.weights.medium,
  fontSize: typography.sizes.sm,
  letterSpacing: typography.letterSpacing.wider,
  textTransform: 'uppercase',
  transition: 'all 0.15s ease',
  outline: 'none',
  background: 'rgba(255, 255, 255, 0.05)',
  color: colors.text,
  padding: '8px 16px',
};

export const buttonAccent = {
  ...buttonBase,
  background: 'rgba(110, 168, 215, 0.10)',
  border: '1px solid rgba(110, 168, 215, 0.22)',
  color: colors.accent,
};

export const buttonGhost = {
  ...buttonBase,
};

export const buttonDanger = {
  ...buttonBase,
  background: 'rgba(255, 68, 68, 0.08)',
  border: '1px solid rgba(255, 68, 68, 0.22)',
  color: colors.danger,
};

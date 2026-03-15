// ─── FireSight Design System — Palantir Style ─────────────────────────────
// Monochromatic UI chrome. Single cold blue accent for interactive elements.
// Warm colors (gold/orange/red) ONLY in data visualizations (fire on terrain,
// timeline bar). Red in chrome ONLY for genuine critical alerts.

export const colors = {
  // Backgrounds — near-black, solid
  bg: '#0A0D11',
  bgPanel: '#0F1218',
  bgPanelHover: '#151920',
  bgInset: 'rgba(255, 255, 255, 0.025)',

  // Borders — extremely subtle
  border: 'rgba(255, 255, 255, 0.06)',
  borderSubtle: 'rgba(255, 255, 255, 0.03)',
  borderFocus: 'rgba(255, 255, 255, 0.10)',

  // Accent — cold blue, the ONLY interactive color in chrome
  accent: '#5B9BD5',
  accentDim: 'rgba(91, 155, 213, 0.10)',
  accentMid: 'rgba(91, 155, 213, 0.25)',

  // Fire — DATA LAYER ONLY, never in UI chrome
  fireNow: '#FF4444',
  fireOneHour: '#F27D26',
  fireThreeHour: '#E8B830',

  // Status — semantic: green=healthy/active, red=critical
  statusOk: '#3DB87A',       // muted emerald — system healthy / active / dispatched
  critical: '#E04040',       // muted red — genuine emergencies only

  // Text — cool white, 4-level hierarchy
  text: '#D4DAE3',
  textSecondary: 'rgba(185, 195, 210, 0.72)',
  textTertiary: 'rgba(145, 155, 170, 0.62)',
  textMuted: 'rgba(115, 125, 140, 0.50)',

  // Data values — max legibility mono readouts
  dataValue: '#E2E8F0',
};

export const typography = {
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
  panel: '28px',
  full: '9999px',
};

export const shadows = {
  panel: '0 8px 32px rgba(0, 0, 0, 0.65)',
  panelInset: '0 1px 0 rgba(255, 255, 255, 0.02) inset',
  soft: '0 2px 12px rgba(0, 0, 0, 0.4)',

  // Glows
  glowAccent:   '0 0 6px rgba(91, 155, 213, 0.30)',
  glowStatus:   '0 0 6px rgba(61, 184, 122, 0.35)',
  glowCritical: '0 0 8px rgba(224, 64, 64, 0.40)',
};

export const panelStyle = {
  background: colors.bgPanel,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.panel,
  boxShadow: `${shadows.panel}, ${shadows.panelInset}`,
};

// ─── Buttons — cold blue accent only ──────────────────────────────────────
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
  background: 'rgba(255, 255, 255, 0.04)',
  color: colors.text,
  padding: '8px 16px',
};

export const buttonAccent = {
  ...buttonBase,
  background: colors.accentDim,
  border: `1px solid ${colors.accentMid}`,
  color: colors.accent,
};

export const buttonGhost = {
  ...buttonBase,
};

export const buttonDanger = {
  ...buttonBase,
  background: 'rgba(224, 64, 64, 0.08)',
  border: '1px solid rgba(224, 64, 64, 0.22)',
  color: colors.critical,
};

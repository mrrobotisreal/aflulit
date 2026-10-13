/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // All colors resolve through CSS variables defined in src/global.css —
      // that file is the single place token VALUES live. Never hardcode colors
      // in components; use these token classes (bg-bg, text-text, etc.).
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        // accent at 15% — selection washes, highlight, karaoke word bg
        'accent-soft': 'rgb(var(--accent) / 0.15)',
        // the moonlight second hue (UI_DESIGN §1): focus rings, karaoke caret, ring highlights
        glow: 'rgb(var(--glow) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        scrim: 'rgb(var(--scrim) / <alpha-value>)',
        // Content cards floating over ambient room scenes (T31) — surface at
        // 92% so the scene breathes through without costing legibility
        'surface-veil': 'rgb(var(--surface) / 0.92)',
        // Warm non-horror track identity («Семья», T30) — border/icon/caption
        // accents on track sections; soft = selection/highlight wash
        'track-warm': 'rgb(var(--track-warm) / <alpha-value>)',
        'track-warm-soft': 'rgb(var(--track-warm) / 0.15)',
        // Readiness «с запасом» band (T70) — ≥ 80 %
        gold: 'rgb(var(--gold) / <alpha-value>)',
        // CEFR chip hue ramp (A1 coolest → C1 the accent) — used via LevelChip only
        'level-a1': 'rgb(var(--level-a1) / <alpha-value>)',
        'level-a2': 'rgb(var(--level-a2) / <alpha-value>)',
        'level-b1': 'rgb(var(--level-b1) / <alpha-value>)',
        'level-b2': 'rgb(var(--level-b2) / <alpha-value>)',
        'level-c1': 'rgb(var(--level-c1) / <alpha-value>)',
      },
      fontFamily: {
        // UI chrome (English): Golos Text
        ui: ['GolosText_400Regular'],
        'ui-medium': ['GolosText_500Medium'],
        'ui-bold': ['GolosText_700Bold'],
        // UI Hebrew (chips, tab titles, labels): Noto Sans Hebrew 500 (ADR-0005 §8)
        'ui-he': ['NotoSansHebrew_500Medium'],
        // Display / branding (אַפְלוּלִית wordmark): dripping-paint, Hebrew + niqqud capable
        display: ['RubikWetPaint_400Regular'],
        // Reading (Hebrew story content): Frank Ruhl Libre serif (full niqqud);
        // the face has no italic — Hebrew has no italic tradition, so
        // reading-italic resolves to the regular face (T01 decision).
        reading: ['FrankRuhlLibre_400Regular'],
        'reading-bold': ['FrankRuhlLibre_700Bold'],
        'reading-italic': ['FrankRuhlLibre_400Regular'],
        // Reading sans toggle: Noto Sans Hebrew (Ilan's proven niqqud renderer)
        'reading-sans': ['NotoSansHebrew_400Regular'],
        // Error log stack traces (T22) — Android generic monospace
        mono: ['monospace'],
      },
      fontSize: {
        // UI type scale per UI_DESIGN §2: 12 / 14 / 16 / 20 / 24 / 30
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['20px', { lineHeight: '28px' }],
        xl: ['24px', { lineHeight: '32px' }],
        '2xl': ['30px', { lineHeight: '38px' }],
        // Story text default ~19px/1.6 (user-adjustable from T04)
        reading: ['19px', { lineHeight: '30px' }],
      },
    },
  },
  plugins: [],
};

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cockpit: {
          bg: 'rgb(var(--color-bg) / <alpha-value>)',
          panel: 'rgb(var(--color-surface) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
          accent: 'rgb(var(--color-accent) / <alpha-value>)',
          text: 'rgb(var(--color-text) / <alpha-value>)',
          muted: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          success: 'rgb(var(--color-success) / <alpha-value>)',
          danger: 'rgb(var(--color-danger) / <alpha-value>)',
          warning: 'rgb(var(--color-warning) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Cascadia Code', 'Fira Code', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        'xs': ['12px', { lineHeight: '1.5', letterSpacing: '0.01em' }],
        'sm': ['13px', { lineHeight: '1.5', letterSpacing: '-0.006em' }],
        'base': ['14px', { lineHeight: '1.5', letterSpacing: '-0.011em' }],
        'lg': ['16px', { lineHeight: '1.4', letterSpacing: '-0.011em' }],
        'xl': ['18px', { lineHeight: '1.35', letterSpacing: '-0.014em' }],
        '2xl': ['22px', { lineHeight: '1.3', letterSpacing: '-0.019em' }],
      },
      letterSpacing: {
        'tighter': '-0.02em',
        'tight': '-0.01em',
      },
      lineHeight: {
        'snug': '1.35',
      },
    },
  },
  plugins: [],
};

export default config;

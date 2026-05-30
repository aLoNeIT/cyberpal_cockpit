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
          // 背景/表面
          bg: 'rgb(var(--color-bg) / <alpha-value>)',
          panel: 'rgb(var(--color-surface) / <alpha-value>)',
          'surface-hover': 'rgb(var(--color-surface-hover) / <alpha-value>)',
          'surface-sunken': 'rgb(var(--color-surface-sunken) / <alpha-value>)',

          // 边框
          border: 'rgb(var(--color-border) / <alpha-value>)',
          'border-strong': 'rgb(var(--color-border-strong) / <alpha-value>)',

          // 文字
          text: 'rgb(var(--color-text) / <alpha-value>)',
          muted: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          'text-placeholder': 'rgb(var(--color-text-placeholder) / <alpha-value>)',

          // 品牌/强调色
          accent: 'rgb(var(--color-accent) / <alpha-value>)',
          'accent-hover': 'rgb(var(--color-accent-hover) / <alpha-value>)',
          'accent-subtle': 'rgb(var(--color-accent-subtle) / <alpha-value>)',

          // 语义色
          success: 'rgb(var(--color-success) / <alpha-value>)',
          'success-subtle': 'rgb(var(--color-success-subtle) / <alpha-value>)',
          warning: 'rgb(var(--color-warning) / <alpha-value>)',
          'warning-subtle': 'rgb(var(--color-warning-subtle) / <alpha-value>)',
          danger: 'rgb(var(--color-danger) / <alpha-value>)',
          'danger-subtle': 'rgb(var(--color-danger-subtle) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Cascadia Code Variable', 'Fira Code', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        'xs':  ['12px', { lineHeight: '1.5', letterSpacing: '0em' }],
        'sm':  ['13px', { lineHeight: '1.5', letterSpacing: '-0.006em' }],
        'base':['14px', { lineHeight: '1.5', letterSpacing: '-0.011em' }],
        'lg':  ['16px', { lineHeight: '1.4', letterSpacing: '-0.011em' }],
        'xl':  ['18px', { lineHeight: '1.35', letterSpacing: '-0.014em' }],
        '2xl': ['22px', { lineHeight: '1.3', letterSpacing: '-0.019em' }],
      },
      borderRadius: {
        'sm':   'var(--radius-sm)',    /* 6px  — 小标签、输入框、按钮 */
        'md':   'var(--radius-md)',    /* 10px — 卡片、中等按钮、下拉菜单 */
        'lg':   'var(--radius-lg)',    /* 16px — 大型面板、弹窗 */
        'full': 'var(--radius-full)',  /* ∞    — 头像、Badge、Pill 按钮 */
      },
      boxShadow: {
        'cockpit-xs': 'var(--shadow-xs)',
        'cockpit-sm': 'var(--shadow-sm)',
        'cockpit-md': 'var(--shadow-md)',
        'cockpit-lg': 'var(--shadow-lg)',
      },
      transitionTimingFunction: {
        'standard':   'var(--ease-standard)',
        'decelerate': 'var(--ease-decelerate)',
        'accelerate': 'var(--ease-accelerate)',
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
        '300': '300ms',
      },
      letterSpacing: {
        'tighter': '-0.02em',
        'tight':   '-0.01em',
      },
      lineHeight: {
        'snug': '1.35',
      },
    },
  },
  plugins: [],
};

export default config;

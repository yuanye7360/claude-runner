import typography from '@tailwindcss/typography';
import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,vue,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        cyber: {
          base: 'var(--bg-base)',
          'base-end': 'var(--bg-base-end)',
          sidebar: 'var(--bg-sidebar)',
          surface: 'var(--bg-surface)',
          'surface-hover': 'var(--bg-surface-hover)',
          primary: 'var(--color-primary)',
          accent: 'var(--color-accent)',
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          text: 'var(--color-text)',
          'text-active': 'var(--color-text-active)',
          'text-muted': 'var(--color-text-muted)',
        },
      },
      borderColor: {
        glow: 'var(--border-glow)',
        'glow-strong': 'var(--border-glow-strong)',
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
      },
    },
  },
  plugins: [typography],
};

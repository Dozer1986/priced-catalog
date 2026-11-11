/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './sources.html', './tracker.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        paper: 'var(--paper)',
        field: 'var(--field)',
        rule: 'var(--rule)',
        mark: 'var(--mark)',
        'on-mark': 'var(--on-mark)',
        'tag-water': 'var(--tag-water)',
        'tag-comms': 'var(--tag-comms)',
        'tag-electric': 'var(--tag-electric)',
      },
      fontFamily: {
        sans: ['"Archivo Variable"', 'Archivo', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { sheet: '2px' },
    },
  },
  plugins: [],
};

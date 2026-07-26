import { defineConfig } from 'vite';
import { devtools } from '@tanstack/devtools-vite';

import { tanstackRouter } from '@tanstack/router-plugin/vite';

import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const config = defineConfig({
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  plugins: [
    devtools(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    viteReact(),
    tailwindcss(),
  ],
});

export default config;

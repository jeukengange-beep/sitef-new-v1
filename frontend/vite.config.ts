import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const hasApiBaseUrl = Boolean(env.VITE_API_BASE_URL);

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: hasApiBaseUrl
        ? undefined
        : {
            '/api': {
              target: 'http://localhost:8787',
              changeOrigin: true
            }
          }
    }
  };
});

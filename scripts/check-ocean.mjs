// Runs tests/check-ocean-float.ts through Vite: npm run check:ocean
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/tests/check-ocean-float.ts');
} finally {
  await server.close();
}

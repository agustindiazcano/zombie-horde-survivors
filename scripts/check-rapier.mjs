// Runs tests/check-rapier-determinism.ts through Vite: npm run check:rapier
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/tests/check-rapier-determinism.ts');
} finally {
  await server.close();
}

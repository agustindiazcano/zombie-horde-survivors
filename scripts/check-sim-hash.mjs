// Runs tests/check-sim-hash.ts through Vite: npm run check:sim-hash
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/tests/check-sim-hash.ts');
} finally {
  await server.close();
}

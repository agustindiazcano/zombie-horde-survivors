// Runs tests/check-ragdoll.ts through Vite (so TypeScript and JSON imports resolve): npm run check:ragdoll
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/tests/check-ragdoll.ts');
} finally {
  await server.close();
}

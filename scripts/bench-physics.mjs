// Runs tests/bench-physics.ts through Vite (so TypeScript and JSON imports resolve): npm run bench:physics
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/tests/bench-physics.ts');
} finally {
  await server.close();
}

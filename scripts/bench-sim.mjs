// Runs tests/bench-sim.ts through Vite (so TypeScript and JSON imports resolve): npm run bench:sim
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/tests/bench-sim.ts');
} finally {
  await server.close();
}

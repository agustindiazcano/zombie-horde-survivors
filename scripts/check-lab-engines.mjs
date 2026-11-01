// Runs tests/check-lab-engines.ts through Vite: npm run check:lab-engines
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/tests/check-lab-engines.ts');
} finally {
  await server.close();
}

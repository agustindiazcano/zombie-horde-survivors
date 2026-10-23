// Runs tests/check-kernels.ts through Vite: npm run check:kernels
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/tests/check-kernels.ts');
} finally {
  await server.close();
}

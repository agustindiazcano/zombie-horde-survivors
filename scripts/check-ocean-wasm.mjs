// Runs tests/check-ocean-wasm.ts through Vite: npm run check:ocean-wasm
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/tests/check-ocean-wasm.ts');
} finally {
  await server.close();
}

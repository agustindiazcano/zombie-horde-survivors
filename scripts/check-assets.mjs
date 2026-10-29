import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readAssets, readTestingAssets, validateAssets } from './assets.mjs';

const assets = readAssets();
const errors = validateAssets(assets);
if (errors.length > 0) {
  console.error('assets.toml check failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`assets.toml OK (${assets.length} asset${assets.length === 1 ? '' : 's'})`);

// Test-only models (license not allowed): never an error, always a warning.
const testing = readTestingAssets();
const missing = testing.filter((a) => !existsSync(resolve(process.cwd(), a.path)));
if (missing.length > 0) {
  console.error(
    'testing_asset files not found:\n' + missing.map((a) => `  - ${a.path}`).join('\n'),
  );
  process.exit(1);
}
if (testing.length > 0) {
  console.warn(
    `WARNING: ${testing.length} test-only model(s) with a license that is not allowed (do not ship them):\n` +
      testing.map((a) => `  - ${a.name} (${a.license}) ${a.path}`).join('\n'),
  );
}

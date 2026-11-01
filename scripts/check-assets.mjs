import { readAssets, readTestingAssets, validateAssets } from './assets.mjs';

const assets = readAssets();
const errors = validateAssets(assets);
if (errors.length > 0) {
  console.error('assets.toml check failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`assets.toml OK (${assets.length} asset${assets.length === 1 ? '' : 's'})`);

// Test-only models (license not allowed, or kept out of git): never an error, always a warning.
const testing = readTestingAssets();
if (testing.length > 0) {
  console.warn(
    `WARNING: ${testing.length} test-only model(s), not for a public build:\n` +
      testing.map((a) => `  - ${a.name} (${a.license}) ${a.path}`).join('\n'),
  );
}

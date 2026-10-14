import { readAssets, validateAssets } from './assets.mjs';

const assets = readAssets();
const errors = validateAssets(assets);
if (errors.length > 0) {
  console.error('assets.toml check failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`assets.toml OK (${assets.length} asset${assets.length === 1 ? '' : 's'})`);

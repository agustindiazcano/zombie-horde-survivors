import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'smol-toml';

export const ALLOWED_LICENSES = ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0'];
const REQUIRED = ['name', 'author', 'source', 'license', 'path'];

export function readAssets(file = 'assets.toml') {
  const doc = parse(readFileSync(file, 'utf8'));
  return Array.isArray(doc.asset) ? doc.asset : [];
}

/** Returns a list of human-readable problems; empty means the manifest is valid. */
export function validateAssets(assets, root = process.cwd()) {
  const errors = [];
  assets.forEach((a, i) => {
    const label = `asset #${i + 1}${a.name ? ` (${a.name})` : ''}`;
    for (const key of REQUIRED) {
      if (typeof a[key] !== 'string' || a[key].trim() === '')
        errors.push(`${label}: missing "${key}"`);
    }
    if (a.license && !ALLOWED_LICENSES.includes(a.license)) {
      errors.push(`${label}: license "${a.license}" is not one of ${ALLOWED_LICENSES.join(', ')}`);
    }
    if (a.path && !existsSync(resolve(root, a.path)))
      errors.push(`${label}: file not found: ${a.path}`);
  });
  return errors;
}

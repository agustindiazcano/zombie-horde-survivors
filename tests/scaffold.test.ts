import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../src/sim';

function listTs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listTs(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('scaffold', () => {
  it('exposes a 60 Hz fixed timestep', () => {
    expect(FIXED_DT).toBeCloseTo(1 / 60);
  });

  it('keeps src/sim free of Three.js and renderer imports', () => {
    for (const file of listTs('src/sim')) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from\s+['"]three/);
      expect(source, file).not.toMatch(/from\s+['"][^'"]*render/);
    }
  });
});

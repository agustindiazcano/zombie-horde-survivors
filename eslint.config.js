import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'src/wasm/sim-core'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // The simulation must stay renderer-agnostic so it can be unit tested.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'src/sim must not import Three.js.' },
            { group: ['**/render/**'], message: 'src/sim must not import the renderer.' },
          ],
        },
      ],
    },
  },
  {
    // The standard maths differ between browsers (and from Rust) in the last bit; the sim has its own.
    files: ['src/sim/**/*.ts'],
    ignores: ['src/sim/dmath.ts', 'src/sim/vec.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['sin', 'cos', 'atan2', 'exp', 'log', 'pow', 'hypot'].map((property) => ({
          object: 'Math',
          property,
          message: `Use the deterministic version of Math.${property} from src/sim/dmath.ts or src/sim/vec.ts.`,
        })),
      ],
    },
  },
  prettier,
);

import { readFileSync, writeFileSync } from 'node:fs';
import { readAssets } from './assets.mjs';

const START = '<!-- credits:start -->';
const END = '<!-- credits:end -->';

const assets = readAssets();
const body =
  assets.length === 0
    ? '_No third-party assets yet; characters are primitive placeholders._'
    : assets.map((a) => `- **${a.name}** by ${a.author} — [${a.license}](${a.source})`).join('\n');

const readme = readFileSync('README.md', 'utf8');
const from = readme.indexOf(START);
const to = readme.indexOf(END);
if (from === -1 || to === -1 || to < from) {
  console.error(`README.md is missing the ${START} / ${END} markers`);
  process.exit(1);
}
writeFileSync(
  'README.md',
  `${readme.slice(0, from + START.length)}
${body}
${readme.slice(to)}`,
);
// The same list feeds the in-game credits screen.
writeFileSync(
  'data/credits.json',
  `${JSON.stringify(
    assets.map(({ name, author, source, license }) => ({ name, author, source, license })),
    null,
    2,
  )}
`,
);
console.log(`README credits updated (${assets.length} assets)`);

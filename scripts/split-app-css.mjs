/**
 * One-time splitter: breaks monolithic src/app.css into src/styles/* modules.
 * Run: node scripts/split-app-css.mjs
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(root, 'src/app.css'), 'utf8');
const lines = css.split('\n');

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

/** Ranges are 1-indexed inclusive. Light-theme token block (970–1031) lives in tokens.css. */
const chunks = [
  { file: 'base.css', ranges: [[76, 213]] },
  { file: 'toast.css', ranges: [[215, 340]] },
  { file: 'settings-structure.css', ranges: [[342, 393]] },
  { file: 'components.css', ranges: [[395, 969], [1032, 1091]] },
  { file: 'shell.css', ranges: [[1092, 2213]] },
  { file: 'profile.css', ranges: [[2214, 2323]] },
  { file: 'todos.css', ranges: [[2324, 3422]] },
  { file: 'home.css', ranges: [[3423, 3997]] },
  { file: 'misc-teams-people.css', ranges: [[3998, 5044]] },
  { file: 'todos-dnd.css', ranges: [[5045, 5560]] },
  { file: 'analytics.css', ranges: [[5561, 6239]] },
  { file: 'dialogs.css', ranges: [[6240, 7438]] },
  { file: 'notes.css', ranges: [[7439, 9328]] },
  { file: 'misc.css', ranges: [[9329, 10032]] },
  { file: 'richtext.css', ranges: [[10033, 10540]] },
  { file: 'planning.css', ranges: [[10541, lines.length]] },
];

const outDir = path.join(root, 'src/styles');
fs.mkdirSync(outDir, { recursive: true });

for (const { file, ranges } of chunks) {
  const content = ranges.map(([s, e]) => slice(s, e)).join('\n\n');
  fs.writeFileSync(path.join(outDir, file), content.trim() + '\n');
}

console.log(`Split ${lines.length} lines into ${chunks.length} files under src/styles/`);

import { readFileSync } from 'node:fs';

const idx = process.argv[2] ?? '0';
const q = readFileSync(`.tmp-batch-${idx}.sql`, 'utf8');
process.stdout.write(JSON.stringify({ project_id: 'kcaliyzmsvsrkuonnmrc', query: q }));

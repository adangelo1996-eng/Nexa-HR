import { readFileSync } from 'node:fs';

const idx = process.argv[2] ?? '0';
process.stdout.write(readFileSync(`.tmp-batch-${idx}.sql`, 'utf8'));

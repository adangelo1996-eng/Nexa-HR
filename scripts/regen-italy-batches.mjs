import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync('infra/supabase/migrations/035_backfill_demo_users_italy_anagrafica.sql', 'utf8').replace(/\r\n/g, '\n');
const stmts = raw
  .split(/(?=^UPDATE public\.users)/m)
  .map((s) => s.trim())
  .filter(Boolean);
const batches = [];
for (let i = 0; i < stmts.length; i += 5) {
  batches.push(stmts.slice(i, i + 5).join('\n\n'));
}
batches.forEach((b, j) => writeFileSync(`.tmp-batch-${j}.sql`, b, 'utf8'));
console.log('stmts', stmts.length, 'sizes', batches.map((b) => b.length));

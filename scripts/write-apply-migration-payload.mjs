import { readFileSync, writeFileSync } from 'node:fs';

const idx = process.argv[2] ?? '0';
const q = readFileSync(`infra/supabase/temp/batch-${idx}-oneline.sql`, 'utf8');
const payload = {
  project_id: 'kcaliyzmsvsrkuonnmrc',
  name: `italy_demo_batch_${idx}`,
  query: q,
};
writeFileSync(`infra/supabase/temp/apply-batch-${idx}.json`, JSON.stringify(payload), 'utf8');
console.log('wrote', `apply-batch-${idx}.json`);

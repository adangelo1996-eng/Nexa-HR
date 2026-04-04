import { readFileSync, writeFileSync } from 'node:fs';

const idx = process.argv[2] ?? '0';
const q = readFileSync(`infra/supabase/temp/batch-${idx}-oneline.sql`, 'utf8');
const payload = { project_id: 'kcaliyzmsvsrkuonnmrc', query: q };
writeFileSync(`infra/supabase/temp/payload-${idx}.json`, JSON.stringify(payload), 'utf8');
console.log('wrote', `payload-${idx}.json`, Buffer.byteLength(JSON.stringify(payload), 'utf8'));

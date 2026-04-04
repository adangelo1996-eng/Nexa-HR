import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'infra/supabase/temp/mcp-exec-line.json';
const j = JSON.parse(readFileSync(path, 'utf8'));
console.log('queryLen', j.query.length);

import { readFileSync, writeFileSync } from 'node:fs';

const idx = process.argv[2] ?? '0';
const j = JSON.parse(readFileSync(`.tmp-mcp-args-${idx}.json`, 'utf8'));
writeFileSync(`.tmp-extracted-query-${idx}.sql`, j.query, 'utf8');
console.log('bytes', Buffer.byteLength(j.query, 'utf8'));

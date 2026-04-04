import fs from "node:fs";
import path from "node:path";

const dir = path.join("infra", "supabase", "temp");
for (const n of [1, 2, 3, 4]) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, `apply-batch-${n}.json`), "utf8"));
  const parts = j.query.split(/\n\n(?=UPDATE )/);
  const outDir = path.join(dir, `batch-${n}-splits`);
  fs.mkdirSync(outDir, { recursive: true });
  parts.forEach((sql, i) => {
    fs.writeFileSync(path.join(outDir, `part-${i}.sql`), sql.trim() + "\n", "utf8");
  });
  console.log(`batch-${n}: ${parts.length} parts`);
}

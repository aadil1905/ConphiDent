import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const DELETE_IDS = [2, 4, 6, 7, 9];
const KEEP_IDS = [1, 3];
const idList = DELETE_IDS.join(",");

const keep = await p.clinic.findMany({ where: { id: { in: KEEP_IDS } }, select: { id: true, slug: true } });
const bySlug = Object.fromEntries(keep.map(c => [c.id, c.slug]));
if (bySlug[1] !== "deepika-dental-white" || bySlug[3] !== "conphident-platform") {
  throw new Error(`Keeper mismatch: ${JSON.stringify(bySlug)} — aborting.`);
}

const tables = (await p.$queryRawUnsafe(
  `SELECT DISTINCT table_name FROM information_schema.columns
   WHERE column_name = 'clinicId' AND table_schema = 'public' AND table_name <> 'Clinic'`
)).map(r => r.table_name);

// Every FK edge in the schema, so children that carry no clinicId themselves
// can be cleared through a join against their doomed parent.
const fks = await p.$queryRawUnsafe(`
  SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,
         a.attname AS child_col, af.attname AS parent_col
  FROM pg_constraint c
  JOIN unnest(c.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
  JOIN unnest(c.confkey) WITH ORDINALITY AS cfk(attnum, ord) ON ck.ord = cfk.ord
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ck.attnum
  JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = cfk.attnum
  WHERE c.contype = 'f' AND connamespace = 'public'::regnamespace`);

let total = 0;
await p.$transaction(async (tx) => {
  const attempt = async (sql) => {
    await tx.$executeRawUnsafe(`SAVEPOINT sp`);
    try {
      const n = await tx.$executeRawUnsafe(sql);
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT sp`);
      return n;
    } catch {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT sp`);
      return null;
    }
  };

  const remaining = new Set(tables);
  for (let pass = 1; pass <= 20 && remaining.size; pass++) {
    let progressed = false;
    for (const table of [...remaining]) {
      const n = await attempt(`DELETE FROM "${table}" WHERE "clinicId" IN (${idList})`);
      if (n !== null) {
        if (n > 0) { console.log(`clear ${table}: ${n}`); total += n; }
        remaining.delete(table);
        progressed = true;
      }
    }
    if (progressed) continue;
    // Stuck: clear children of the blocked tables through their FK joins.
    let swept = false;
    for (const table of [...remaining]) {
      for (const fk of fks.filter(f => f.parent.replace(/"/g, "") === table)) {
        const child = fk.child.replace(/"/g, "");
        const n = await attempt(
          `DELETE FROM "${child}" c USING "${table}" t
           WHERE c."${fk.child_col}" = t."${fk.parent_col}" AND t."clinicId" IN (${idList})`);
        if (n) { console.log(`sweep ${child} (via ${table}): ${n}`); total += n; swept = true; }
      }
    }
    if (!swept) break;
  }
  if (remaining.size) throw new Error(`Still blocked: ${[...remaining].join(", ")} — rolled back.`);
  const clinics = await tx.$executeRawUnsafe(`DELETE FROM "Clinic" WHERE id IN (${idList})`);
  console.log(`Clinic rows deleted: ${clinics}`); total += clinics;
}, { timeout: 240000 });

console.log(`TOTAL rows removed: ${total}`);
const left = await p.clinic.findMany({ select: { id: true, brandName: true, name: true } });
console.log("Remaining clinics:", left.map(c => `${c.id}:${c.brandName || c.name}`).join(" | "));
const users = await p.user.findMany({ select: { id: true, email: true, clinicId: true } });
console.log("Remaining users:", users.map(u => `${u.email}@clinic${u.clinicId}`).join(" | "));
await p.$disconnect();

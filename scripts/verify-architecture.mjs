import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredPaths = [
  "app",
  "components",
  "lib",
  "prisma/schema.prisma",
  "components/ui/button.tsx",
  "components/ui/dialog.tsx",
];

const deprecatedRootFiles = [
  "AppointmentForm.tsx",
  "PatientForm.tsx",
  "PaymentForm.tsx",
  "button.tsx",
  "dialog.tsx",
  "prisma.ts",
  "validations.ts",
];

for (const path of requiredPaths) {
  if (!existsSync(join(root, path))) {
    throw new Error(`Required application boundary is missing: ${path}`);
  }
}

const tsconfig = readFileSync(join(root, "tsconfig.json"), "utf8");
if (/"\*\.tsx"/.test(tsconfig)) {
  throw new Error("tsconfig.json must not exclude all TSX files from type-checking.");
}

const prismaConfig = readFileSync(join(root, "prisma.config.ts"), "utf8");
if (!prismaConfig.includes('schema: "prisma/schema.prisma"')) {
  throw new Error("Prisma must use prisma/schema.prisma as its single active schema.");
}

// PostgreSQL can only use an ON CONFLICT target after the matching unique
// index/constraint exists. Keep this production migration safe to replay.
const laboratoryMigrationPath = join(root, "prisma/migrations/20260809140000_add_laboratory_directory/migration.sql");
const laboratoryMigration = readFileSync(laboratoryMigrationPath, "utf8");
const laboratoryUniqueIndex = laboratoryMigration.indexOf('CREATE UNIQUE INDEX "Laboratory_clinicId_name_key"');
const laboratoryUpsert = laboratoryMigration.indexOf('ON CONFLICT ("clinicId", "name") DO NOTHING');
if (laboratoryUniqueIndex < 0 || laboratoryUpsert < 0 || laboratoryUniqueIndex > laboratoryUpsert) {
  throw new Error("Laboratory directory migration must create its clinic/name unique index before the ON CONFLICT backfill.");
}

const presentLegacyFiles = deprecatedRootFiles.filter((path) => existsSync(join(root, path)));
if (presentLegacyFiles.length > 0) {
  console.warn(
    `Legacy root copies are present and ignored by the active application: ${presentLegacyFiles.join(", ")}`,
  );
}

console.log("Architecture boundaries verified.");

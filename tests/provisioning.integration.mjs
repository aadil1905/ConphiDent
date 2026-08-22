import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Prisma, PrismaClient } from "@prisma/client";

const root = new URL("../", import.meta.url);
const actions = await readFile(
  new URL("app/platform/actions.ts", root),
  "utf8",
);
const wizard = await readFile(
  new URL("components/platform/ClinicOnboardingWizard.tsx", root),
  "utf8",
);
const auth = await readFile(new URL("lib/auth.ts", root), "utf8");
const loginActions = await readFile(
  new URL("app/login/actions.ts", root),
  "utf8",
);
const platformMediaRoute = await readFile(
  new URL("app/api/platform/clinics/[clinicId]/media/route.ts", root),
  "utf8",
);
const migration = await readFile(
  new URL(
    "prisma/migrations/20260811183000_add_provisioning_draft_lifecycle/migration.sql",
    root,
  ),
  "utf8",
);
const passwordRotationMigration = await readFile(
  new URL(
    "prisma/migrations/20260811192000_add_temporary_password_rotation/migration.sql",
    root,
  ),
  "utf8",
);

function functionDeclaration(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Expected function ${name} in production source.`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse function ${name}.`);
}

function arrowFunction(source, declaration) {
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `Expected ${declaration} in production source.`);
  const expressionStart = start + declaration.length;
  const bodyStart = source.indexOf("{", expressionStart);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(expressionStart, index + 1);
  }
  throw new Error(`Could not parse ${declaration}.`);
}

function compileDraftHelpers() {
  const fields = actions.match(
    /const DRAFT_FIELDS = new Set\((\[[\s\S]*?\])\);/,
  )?.[1];
  assert.ok(fields, "Expected the production draft field allowlist.");
  const extract = functionDeclaration(actions, "extractDraftData")
    .replace("formData: FormData", "formData")
    .replace(
      "const data: Record<string, string | string[]> = {};",
      "const data = {};",
    );
  const canonical = functionDeclaration(actions, "canonicalDraftData")
    .replace("value: unknown", "value")
    .replace(
      "const record = value as Record<string, unknown>;",
      "const record = value;",
    );
  return Function(
    `"use strict"; const DRAFT_FIELDS = new Set(${fields}); ${extract}; ${canonical}; return { DRAFT_FIELDS, extractDraftData, canonicalDraftData };`,
  )();
}

function compilePasswordPolicy() {
  const minimum = auth.match(/PASSWORD_MIN_LENGTH = (\d+)/)?.[1];
  assert.ok(minimum, "Expected the production password minimum.");
  const policy = functionDeclaration(auth, "passwordPolicyError")
    .replace("password: string", "password")
    .replace(/^export /, "");
  return Function(
    `"use strict"; const PASSWORD_MIN_LENGTH = ${minimum}; ${policy}; return passwordPolicyError;`,
  )();
}

function compileSteps() {
  const literal = wizard.match(/const steps = (\[[\s\S]*?\]) as const;/)?.[1];
  assert.ok(literal, "Expected the production wizard step definitions.");
  return Function(`"use strict"; return (${literal});`)();
}

function compileStepCompletion({ form, completed, steps, currentStep }) {
  const implementation = arrowFunction(wizard, "const stepComplete = ")
    .replace("(index: number)", "(index)")
    .replaceAll("(item as HTMLInputElement)", "item")
    .replace(/\s+as HTMLInputElement\[\]/g, "");
  return Function(
    "formRef",
    "completed",
    "steps",
    "step",
    `"use strict"; return (${implementation});`,
  )({ current: form }, completed, steps, currentStep);
}

function input(
  name,
  value = "",
  { type = "text", checked = false, valid = true } = {},
) {
  return {
    name,
    value,
    type,
    checked,
    checkValidity: () => valid,
  };
}

const { DRAFT_FIELDS, extractDraftData, canonicalDraftData } =
  compileDraftHelpers();
const passwordPolicyError = compilePasswordPolicy();
const steps = compileSteps();

test("production draft sanitizer trims, bounds, and excludes secrets", () => {
  const payload = new FormData();
  payload.set("name", "  ConphiDent Test  ");
  payload.set("ownerEmail", "  owner@example.test ");
  payload.set("password", "NeverPersistThis123");
  payload.set("metaAccessToken", "also-never-persist");
  payload.set("locationPhone", "   ");
  payload.set("welcomeEnglish", `  ${"x".repeat(4_500)}  `);
  payload.append("providerName", `  ${"A".repeat(450)}  `);
  payload.append("providerName", " Dr B ");

  const safe = extractDraftData(payload);

  assert.equal(DRAFT_FIELDS.has("password"), false);
  assert.equal(safe.name, "ConphiDent Test");
  assert.equal(safe.ownerEmail, "owner@example.test");
  assert.equal(safe.welcomeEnglish.length, 4_000);
  assert.deepEqual(safe.providerName, ["A".repeat(400), "Dr B"]);
  assert.equal("locationPhone" in safe, false);
  assert.equal("password" in safe, false);
  assert.equal("metaAccessToken" in safe, false);
  assert.doesNotMatch(wizard, /localStorage/);
});

test("production canonicalizer creates stable non-secret preflight snapshots", () => {
  const first = new FormData();
  first.set("name", "Clinic A");
  first.set("ownerEmail", "owner@example.test");
  first.append("serviceName", "Implants");
  first.append("serviceName", "Dentures");
  first.set("password", "StrongPassword123");

  const reordered = new FormData();
  reordered.set("ownerEmail", "owner@example.test");
  reordered.append("serviceName", "Implants");
  reordered.append("serviceName", "Dentures");
  reordered.set("name", "Clinic A");
  reordered.set("password", "DifferentStrong456");

  const snapshot = extractDraftData(first);
  const equivalent = extractDraftData(reordered);
  assert.equal(canonicalDraftData(snapshot), canonicalDraftData(equivalent));
  assert.equal("password" in snapshot, false);
  assert.equal(passwordPolicyError(first.get("password")), null);
  assert.equal(passwordPolicyError(reordered.get("password")), null);

  reordered.set("name", "Clinic B");
  assert.notEqual(
    canonicalDraftData(snapshot),
    canonicalDraftData(extractDraftData(reordered)),
  );
  assert.equal(canonicalDraftData(null), "");
  assert.equal(canonicalDraftData([]), "");
});

test("preflight evaluates the temporary password without persisting it", () => {
  assert.match(passwordPolicyError("short"), /at least 12/i);
  assert.match(
    passwordPolicyError("alllowercase123"),
    /upper- and lower-case/i,
  );
  assert.equal(passwordPolicyError("ValidPassword123"), null);

  const preflightBody = arrowFunction(wizard, "const runPreflight = ");
  assert.match(preflightBody, /const payload = new FormData\(form\)/);
  assert.doesNotMatch(preflightBody, /payload\.delete\(["']password["']\)/);
  assert.match(actions, /const password = String\(formData\.get\("password"\)/);
  assert.match(
    actions,
    /const passwordIssue = passwordPolicyError\(password\)/,
  );
});

test("production wizard completion enforces validity, selections, and reached optional steps", () => {
  const organization = [
    input("name", "Clinic A"),
    input("ownerName", "Owner"),
    input("ownerEmail", "owner@example.test"),
    input("password", "ValidPassword123"),
  ];
  const completeAtStepZero = compileStepCompletion({
    form: { elements: organization },
    completed: steps.map(() => false),
    steps,
    currentStep: 0,
  });
  assert.equal(completeAtStepZero(0), true);
  assert.equal(completeAtStepZero(3), false);

  const invalidEmail = organization.map((control) =>
    control.name === "ownerEmail"
      ? input("ownerEmail", "not-an-email", { valid: false })
      : control,
  );
  assert.equal(
    compileStepCompletion({
      form: { elements: invalidEmail },
      completed: steps.map(() => false),
      steps,
      currentStep: 0,
    })(0),
    false,
  );
  assert.equal(
    compileStepCompletion({
      form: {
        elements: organization.filter(({ name }) => name !== "password"),
      },
      completed: steps.map(() => false),
      steps,
      currentStep: 0,
    })(0),
    false,
  );

  const serviceControls = [
    input("serviceName", "Implants", { type: "checkbox", checked: false }),
    input("serviceName", "Dentures", { type: "checkbox", checked: true }),
  ];
  const completeAtServices = compileStepCompletion({
    form: { elements: serviceControls },
    completed: steps.map(() => false),
    steps,
    currentStep: 5,
  });
  assert.equal(completeAtServices(3), true);
  assert.equal(completeAtServices(5), true);
});

test("server activation requires a matching preflight claim and stays off-line", () => {
  assert.match(actions, /activationConfirmation !== "ACTIVATE"/);
  assert.match(actions, /status: "PREFLIGHTED"/);
  assert.match(actions, /canonicalDraftData\(preflightDraft\.data\)/);
  assert.match(actions, /tx\.platformProvisioningDraft\.updateMany/);
  assert.match(
    actions,
    /const created = await tx\.clinic\.create\([\s\S]*?status: "ONBOARDING"/,
  );
  assert.match(wizard, /Run preflight/);
  assert.match(wizard, /preflightState !== "passed"/);
});

test("provisioned credentials require first-sign-in password rotation", () => {
  assert.match(actions, /mustChangePassword: true/);
  // The sign-in redirect gained `RedirectType.replace` when the back-button
  // trap was fixed — inside a Server Action, Next 16's `redirect()` pushes
  // history by default, which left /login reachable by pressing Back. What
  // this test guards is the rotation gate, not how history is written, so the
  // argument list is matched loosely enough to survive that.
  assert.match(
    auth,
    /if \(user\.mustChangePassword\) redirect\("\/change-password"/,
  );
  assert.match(
    loginActions,
    /if \(user\.mustChangePassword\) redirect\("\/change-password"/,
  );
  assert.match(loginActions, /mustChangePassword: false/);
  assert.match(
    passwordRotationMigration,
    /ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false/,
  );
});

test("password reset claims the exact unexpired token before changing credentials", () => {
  const reset = functionDeclaration(loginActions, "resetPasswordAction");
  const claim = reset.indexOf("const claim = await tx.passwordResetToken.deleteMany");
  const passwordUpdate = reset.indexOf("const user = await tx.user.update");
  assert.ok(claim >= 0 && passwordUpdate > claim);
  assert.match(reset, /where: \{ id: reset\.id, tokenHash, expiresAt: \{ gt: now \} \}/);
  assert.match(reset, /if \(claim\.count !== 1\) return null/);
  assert.match(reset, /TransactionIsolationLevel\.Serializable/);
  assert.match(reset, /error\.code === "P2034"/);
  const audit = reset.indexOf("await tx.auditLog.create");
  assert.ok(audit > passwordUpdate);
  assert.match(reset, /action: "PASSWORD_RESET_COMPLETED"/);
});

test("platform clinic media mutation requires tenant update permission", () => {
  assert.match(platformMediaRoute, /requirePlatformPermission\("tenant\.update"\)/);
  assert.doesNotMatch(platformMediaRoute, /requirePlatformAdmin\(\)/);
});

test("wizard exposes grouped progress, review edit links, and recoverable draft controls", async () => {
  assert.deepEqual(
    [...new Set(steps.map(({ group }) => group))],
    ["Organization", "Operations", "Integrations", "Commercial", "Launch"],
  );
  assert.match(wizard, /Save and exit/);
  assert.match(wizard, /<Review\s+label=/);
  const dashboard = await readFile(
    new URL("components/platform/ProvisioningDraftDashboard.tsx", root),
    "utf8",
  );
  for (const action of [
    "Resume",
    "Duplicate",
    "Archive",
    "Discard recoverably",
    "Restore draft",
  ])
    assert.match(dashboard, new RegExp(action));
});

test("draft lifecycle migration is backward compatible and indexed", () => {
  assert.match(migration, /ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE'/);
  assert.match(
    migration,
    /ADD COLUMN "currentStep" INTEGER NOT NULL DEFAULT 0/,
  );
  assert.match(migration, /ownerUserId_status_updatedAt_idx/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/);
});

const testUrl = process.env.TEST_DATABASE_URL;
function isDedicatedTestDatabase(
  value,
  productionValue = process.env.DATABASE_URL,
) {
  if (!value || (productionValue && value === productionValue)) return false;
  try {
    const url = new URL(value);
    const protocolAllowed =
      url.protocol === "postgres:" || url.protocol === "postgresql:";
    const username = decodeURIComponent(url.username).toLowerCase();
    const password = decodeURIComponent(url.password).toLowerCase();
    const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const schema = url.searchParams.get("schema") || "";
    return (
      protocolAllowed &&
      Boolean(url.hostname && username && password) &&
      username !== "user" &&
      password !== "password" &&
      /test/i.test(`${database}/${schema}`)
    );
  } catch {
    return false;
  }
}

test("database integration gate rejects production and ambiguous URLs", () => {
  const dedicated = "postgresql://tester:secret@localhost/conphident_test";
  assert.equal(isDedicatedTestDatabase(dedicated, undefined), true);
  assert.equal(
    isDedicatedTestDatabase(
      "postgres://tester:secret@localhost/conphident?schema=provisioning_test",
      undefined,
    ),
    true,
  );
  assert.equal(isDedicatedTestDatabase(undefined, undefined), false);
  assert.equal(
    isDedicatedTestDatabase(
      "postgresql://user:password@localhost/app_test",
      undefined,
    ),
    false,
  );
  assert.equal(
    isDedicatedTestDatabase(
      "postgresql://tester:secret@localhost/production",
      undefined,
    ),
    false,
  );
  assert.equal(
    isDedicatedTestDatabase(
      "postgres-malicious://tester:secret@localhost/app_test",
      undefined,
    ),
    false,
  );
  assert.equal(isDedicatedTestDatabase(dedicated, dedicated), false);
});

const enabled = isDedicatedTestDatabase(testUrl);
const prisma = enabled ? new PrismaClient({ datasourceUrl: testUrl }) : null;
const ids = [];
after(async () => {
  if (!prisma) return;
  if (ids.length)
    await prisma.platformProvisioningDraft.deleteMany({
      where: { id: { in: ids } },
    });
  await prisma.$disconnect();
});

test(
  "draft lifecycle is owner-scoped and recoverable",
  { skip: !enabled },
  async () => {
    const first = await prisma.platformProvisioningDraft.create({
      data: { ownerUserId: 910001, data: { name: "Scoped draft" } },
    });
    ids.push(first.id);
    assert.equal(
      (
        await prisma.platformProvisioningDraft.updateMany({
          where: { id: first.id, ownerUserId: 910002 },
          data: { status: "ARCHIVED" },
        })
      ).count,
      0,
    );
    assert.equal(
      (
        await prisma.platformProvisioningDraft.updateMany({
          where: { id: first.id, ownerUserId: 910001, status: "ACTIVE" },
          data: { status: "ARCHIVED", archivedAt: new Date() },
        })
      ).count,
      1,
    );
    assert.equal(
      (
        await prisma.platformProvisioningDraft.updateMany({
          where: { id: first.id, ownerUserId: 910001, status: "ARCHIVED" },
          data: { status: "ACTIVE", archivedAt: null },
        })
      ).count,
      1,
    );
  },
);

test(
  "activation claim rolls back and only one claim can commit",
  { skip: !enabled },
  async () => {
    const draft = await prisma.platformProvisioningDraft.create({
      data: {
        ownerUserId: 910003,
        status: "PREFLIGHTED",
        currentStep: 10,
        data: { name: "Atomic draft" },
      },
    });
    ids.push(draft.id);
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const result = await tx.platformProvisioningDraft.updateMany({
            where: { id: draft.id, status: "PREFLIGHTED" },
            data: { status: "ACTIVATING" },
          });
          assert.equal(result.count, 1);
          throw new Error("rollback");
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
    assert.equal(
      (
        await prisma.platformProvisioningDraft.findUnique({
          where: { id: draft.id },
        })
      ).status,
      "PREFLIGHTED",
    );
    const claims = await Promise.allSettled(
      [1, 2].map(() =>
        prisma.$transaction(
          async (tx) => {
            const result = await tx.platformProvisioningDraft.updateMany({
              where: { id: draft.id, status: "PREFLIGHTED" },
              data: { status: "ACTIVATING" },
            });
            if (!result.count) throw new Error("already claimed");
            return result.count;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      ),
    );
    assert.equal(
      claims.filter((result) => result.status === "fulfilled").length,
      1,
    );
  },
);

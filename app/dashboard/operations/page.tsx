export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { exactStamp, humanTime, overdueBy, rupees } from "@/lib/format";
import PageHeader from "@/components/lists/PageHeader";
import AuditedActionForm from "@/components/dashboard/AuditedActionForm";
import StockActionButton from "@/components/operations/StockActionButton";
import { AddItemButton, ReceiveStockButton } from "@/components/operations/StockIntake";
import {
  addInventoryItemAction,
  applyConsumptionTemplateAction,
  createPurchaseOrderAction,
  recallInventoryBatchAction,
  receivePurchaseOrderItemAction,
  recordInventoryUsageAction,
  saveConsumptionTemplateAction,
} from "./actions";

const BASE = "/dashboard/operations";
const DAY = 24 * 60 * 60 * 1000;

const TABS = [
  { key: "stock", label: "Stock" },
  { key: "orders", label: "Orders" },
  { key: "history", label: "History" },
] as const;

const FILTERS = [
  { key: "low", label: "Needs ordering" },
  { key: "expiring", label: "Expiring soon" },
  { key: "healthy", label: "Healthy" },
  { key: "all", label: "Everything" },
] as const;

const field =
  "min-h-11 min-w-0 rounded-control border border-border bg-white px-3 text-sm text-foreground outline-none";

function tabHref(tab: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams(extra);
  if (tab !== "stock") params.set("tab", tab);
  const search = params.toString();
  return search ? `${BASE}?${search}` : BASE;
}

function runOutLabel(quantity: number, weekly: number) {
  if (quantity <= 0) return "Out of stock";
  if (weekly <= 0) return "Plenty for now";
  const weeks = quantity / weekly;
  if (weeks < 1) return `Runs out in ${Math.max(1, Math.round(weeks * 7))} days`;
  if (weeks < 2) return "Runs out next week";
  if (weeks < 5) return `About ${Math.floor(weeks)} weeks left`;
  return "Plenty for now";
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; show?: string; q?: string }>;
}) {
  const user = await requirePermission("manageInventory");
  const params = await searchParams;
  const tab = TABS.some((t) => t.key === params.tab) ? params.tab! : "stock";
  const askedShow = FILTERS.some((f) => f.key === params.show) ? params.show! : null;
  const q = (params.q ?? "").trim();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fourWeeksAgo = new Date(now.getTime() - 28 * DAY);
  const inThirtyDays = new Date(now.getTime() + 30 * DAY);

  const [items, usage, orders, movements, patients, plans, templates] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { clinicId: user.clinicId, active: true, archivedAt: null },
      orderBy: [{ quantity: "asc" }, { name: "asc" }],
      include: {
        batches: {
          where: { archivedAt: null, recalledAt: null, availableQuantity: { gt: 0 } },
          orderBy: { expiryDate: "asc" },
          select: { id: true, batchNumber: true, expiryDate: true, availableQuantity: true },
        },
      },
    }),
    prisma.inventoryMovement.groupBy({
      by: ["inventoryItemId"],
      where: { clinicId: user.clinicId, quantityChange: { lt: 0 }, createdAt: { gte: fourWeeksAgo } },
      _sum: { quantityChange: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { clinicId: user.clinicId, status: { notIn: ["CANCELLED", "RECEIVED"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { items: { include: { inventoryItem: { select: { name: true, unit: true } } } } },
    }),
    prisma.inventoryMovement.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { inventoryItem: { select: { name: true } } },
    }),
    prisma.patient.findMany({
      where: { clinicId: user.clinicId, archivedAt: null },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
      take: 150,
    }),
    prisma.treatmentPlan.findMany({
      where: { clinicId: user.clinicId, cancelledAt: null },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.procedureConsumptionTemplate.findMany({
      where: { clinicId: user.clinicId, active: true },
      include: { items: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const weeklyOf = new Map(
    usage.map((row) => [row.inventoryItemId, Math.abs(row._sum.quantityChange ?? 0) / 4]),
  );

  const decorated = items.map((item) => {
    const weekly = weeklyOf.get(item.id) ?? 0;
    const nextExpiry = item.batches.find((batch) => batch.expiryDate)?.expiryDate ?? item.expiryDate;
    const expiringSoon = Boolean(nextExpiry && nextExpiry <= inThirtyDays && nextExpiry >= now);
    const expired = Boolean(nextExpiry && nextExpiry < now);
    const low = item.quantity <= item.reorderLevel;
    const suggested = Math.max(item.reorderQuantity ?? 0, item.reorderLevel - item.quantity, Math.ceil(weekly * 4), 1);
    return { ...item, weekly, nextExpiry, expiringSoon, expired, low, suggested };
  });

  const lowItems = decorated.filter((item) => item.low);
  const expiringItems = decorated.filter((item) => (item.expiringSoon || item.expired) && !item.low);
  const alerts = [...lowItems, ...expiringItems];

  const chipCounts: Record<string, number> = {
    low: decorated.filter((i) => i.low).length,
    expiring: decorated.filter((i) => i.expiringSoon || i.expired).length,
    healthy: decorated.filter((i) => !i.low && !i.expiringSoon && !i.expired).length,
    all: decorated.length,
  };

  // Land on what needs doing, but never on an empty list when there is stock to see.
  const show = askedShow ?? (chipCounts.low > 0 ? "low" : chipCounts.expiring > 0 ? "expiring" : "all");

  const shown = decorated.filter((item) => {
    if (q && !item.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (show === "low") return item.low;
    if (show === "expiring") return item.expiringSoon || item.expired;
    if (show === "healthy") return !item.low && !item.expiringSoon && !item.expired;
    return true;
  });

  // History tiles, all from the ledger.
  const monthMoves = await prisma.inventoryMovement.findMany({
    where: { clinicId: user.clinicId, createdAt: { gte: monthStart } },
    select: { quantityChange: true, unitCost: true, type: true, inventoryItemId: true },
  });
  const costOf = new Map(items.map((item) => [item.id, item.costPerUnit ?? 0]));
  const nameOf = new Map(items.map((item) => [item.id, item.name]));
  const spent = monthMoves
    .filter((move) => move.quantityChange > 0)
    .reduce((sum, move) => sum + move.quantityChange * (move.unitCost ?? costOf.get(move.inventoryItemId) ?? 0), 0);
  const used = monthMoves
    .filter((move) => move.quantityChange < 0 && !["RECALL", "EXPIRED", "ADJUSTMENT"].includes(move.type))
    .reduce((sum, move) => sum + Math.abs(move.quantityChange) * (move.unitCost ?? costOf.get(move.inventoryItemId) ?? 0), 0);
    const binned = monthMoves
    .filter((move) => move.quantityChange < 0 && ["RECALL", "EXPIRED"].includes(move.type))
    .reduce((sum, move) => sum + Math.abs(move.quantityChange) * (move.unitCost ?? costOf.get(move.inventoryItemId) ?? 0), 0);
  const shelfValue = items.reduce((sum, item) => sum + item.quantity * (item.costPerUnit ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Stock"
        sub={
          lowItems.length > 0
            ? `${lowItems.length} ${lowItems.length === 1 ? "item runs" : "items run"} out soon${chipCounts.expiring ? ` · ${chipCounts.expiring} expiring within a month` : ""}`
            : "Nothing running low. Nice."
        }
        actions={
          <>
            <form action={BASE} className="flex items-center gap-2">
              {tab !== "stock" && <input type="hidden" name="tab" value={tab} />}
              <label className="flex min-h-11 items-center gap-2 rounded-control border border-border bg-card px-3">
                <span className="sr-only">Search stock</span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Item name"
                  className="w-[160px] min-w-0 border-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-text-muted"
                />
              </label>
            </form>
            <AddItemButton />
          </>
        }
      />

      <div role="tablist" aria-label="Stock sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={tabHref(item.key)}
            role="tab"
            aria-selected={tab === item.key}
            className={`inline-flex min-h-11 flex-none items-center gap-1.5 border-b-2 px-3.5 text-[13px] font-semibold ${
              tab === item.key
                ? "border-b-primary text-heading"
                : "border-b-transparent text-text-muted hover:text-heading"
            }`}
          >
            {item.label}
            {item.key === "stock" && lowItems.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-danger-bg px-1.5 text-[11px] font-bold text-danger">
                {lowItems.length}
              </span>
            )}
            {item.key === "orders" && orders.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-secondary px-1.5 text-[11px] font-bold text-heading">
                {orders.length}
              </span>
            )}
          </Link>
        ))}
      </div>

      {tab === "stock" && (
        <>
          {/* --- Needs your attention ----------------------------------- */}
          {alerts.length > 0 && (
            <section className="overflow-hidden rounded-card border border-danger-border border-l-[3px] border-l-danger-mark bg-card shadow-[var(--shadow)]">
              <div className="px-4.5 pt-3.5 pb-2.5">
                <h2 className="text-base font-semibold text-heading">
                  {alerts.length === 1 ? "One thing needs your attention" : `${alerts.length} things need your attention`}
                </h2>
                <p className="text-xs text-text-muted">Ordering now keeps tomorrow&rsquo;s list running.</p>
              </div>
              {alerts.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-1 items-center gap-3 border-t border-border/70 px-4.5 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px]"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-heading">{item.name}</p>
                    <p className={`text-xs ${item.low ? "text-danger" : "text-warning"}`}>
                      {item.low
                        ? `${runOutLabel(item.quantity, item.weekly)} · ${item.quantity} ${item.unit} left`
                        : item.expired
                          ? `Expired ${item.nextExpiry ? overdueBy(item.nextExpiry, now) : ""} — do not use`
                          : `Expires ${item.nextExpiry?.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — ${Math.ceil(((item.nextExpiry?.getTime() ?? 0) - now.getTime()) / DAY)} days away`}
                    </p>
                  </div>
                  <p className="text-[13px] text-foreground">
                    {item.low
                      ? item.weekly > 0
                        ? `You get through about ${Math.ceil(item.weekly)} ${item.unit} a week`
                        : `You usually keep ${item.reorderLevel}`
                      : "Use it before then or it goes in the bin"}
                  </p>
                  {item.low ? (
                    <StockActionButton
                      action={createPurchaseOrderAction}
                      fields={{
                        inventoryItemId: String(item.id),
                        quantity: String(item.suggested),
                        supplier: item.supplier || "Usual supplier",
                        notes: "Raised from the stock alert",
                      }}
                      label={`Order ${item.suggested} ${item.unit}`}
                      doneNote={`${item.name} ordered — ${item.suggested} ${item.unit}${item.supplier ? ` from ${item.supplier}` : ""}. It is on the Orders tab.`}
                    />
                  ) : (
                    <span className="text-xs font-semibold text-warning">Use it first</span>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* --- Filter chips -------------------------------------------- */}
          <section className="flex flex-wrap items-center gap-2.5 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
            <span className="text-xs text-text-muted">Show:</span>
            {FILTERS.map((filter) => (
              <Link
                key={filter.key}
                href={tabHref("stock", { ...(q ? { q } : {}), ...(filter.key !== "low" ? { show: filter.key } : {}) })}
                aria-current={show === filter.key ? "true" : undefined}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold whitespace-nowrap text-heading ${
                  show === filter.key ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-muted"
                }`}
              >
                {filter.label}
                <span className={`tabular-nums ${filter.key === "low" && chipCounts.low > 0 ? "text-danger" : "text-text-muted"}`}>
                  {chipCounts[filter.key]}
                </span>
              </Link>
            ))}
            <span className="ml-auto text-xs text-text-muted">
              Showing {shown.length} of {decorated.length} items
            </span>
          </section>

          {/* --- The cupboard -------------------------------------------- */}
          <section className="overflow-x-auto rounded-card border border-border bg-card shadow-[var(--shadow)]">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[minmax(180px,1.4fr)_130px_150px_150px_270px] gap-3 border-b border-border bg-muted px-4.5 py-2.5 text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">
                <span>Item</span>
                <span>In the cupboard</span>
                <span>How long it lasts</span>
                <span>Expires</span>
                <span />
              </div>

              {shown.length === 0 && (
                <div className="flex flex-col items-center gap-1.5 px-4.5 pt-8 pb-10 text-center">
                  <p className="text-[15px] font-semibold text-heading">
                    {show === "low" && !q ? "Nothing running low. Nice." : q ? `Nothing matches “${q}”` : "No items yet"}
                  </p>
                  <p className="text-[13px] text-text-muted">
                    {show === "low" && !q
                      ? "Every item is above its reorder level."
                      : q
                        ? 'Try part of the name, like "gloves".'
                        : "Tap “Add an item” up top and the cupboard starts here."}
                  </p>
                </div>
              )}

              {shown.map((item) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-[minmax(180px,1.4fr)_130px_150px_150px_270px] items-center gap-3 border-b border-border/70 px-4.5 py-2.5 text-[13px] last:border-b-0 ${
                    item.quantity <= 0 || item.expired
                      ? "border-l-[3px] border-l-danger-mark"
                      : item.low || item.expiringSoon
                        ? "border-l-[3px] border-l-[#c4a46c]"
                        : "border-l-[3px] border-l-transparent"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-heading">{item.name}</p>
                    <p className="text-xs text-text-muted">
                      {item.category}
                      {item.supplier ? ` · ${item.supplier}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className={`font-semibold tabular-nums ${item.quantity <= 0 ? "text-danger" : item.low ? "text-warning" : "text-heading"}`}>
                      {item.quantity} {item.unit}
                    </p>
                    <p className="text-xs text-text-muted">usually keep {item.reorderLevel}</p>
                  </div>
                  <p className={`text-xs font-semibold ${item.low ? "text-danger" : "text-text-muted"}`}>
                    {runOutLabel(item.quantity, item.weekly)}
                  </p>
                  <p
                    className={`text-xs ${item.expired ? "font-semibold text-danger" : item.expiringSoon ? "text-danger" : "text-text-muted"}`}
                    title={item.nextExpiry ? exactStamp(item.nextExpiry) : undefined}
                  >
                    {item.nextExpiry
                      ? item.expired
                        ? `Expired — do not use`
                        : item.nextExpiry.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                      : "Does not expire"}
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <StockActionButton
                      action={recordInventoryUsageAction}
                      fields={{ id: String(item.id), quantity: "1", notes: "Used one at the chair" }}
                      label="Used one"
                      doneNote={`One ${item.name.toLowerCase()} taken off. ${Math.max(0, item.quantity - 1)} left.`}
                    />
                    <ReceiveStockButton id={item.id} name={item.name} unit={item.unit} />
                    <StockActionButton
                      action={createPurchaseOrderAction}
                      fields={{
                        inventoryItemId: String(item.id),
                        quantity: String(item.suggested),
                        supplier: item.supplier || "Usual supplier",
                        notes: "Raised from the stock list",
                      }}
                      label="Order"
                      doneNote={`${item.name} ordered — ${item.suggested} ${item.unit}. It is on the Orders tab.`}
                      primary={item.low}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* --- Auto-deduction note + governed extras -------------------- */}
          <section className="flex flex-wrap items-center gap-3.5 rounded-card border border-border bg-card px-4.5 py-3.5 shadow-[var(--shadow)]">
            <div className="min-w-0 flex-[1_1_260px]">
              <p className="text-[13px] font-semibold text-heading">Stock comes off by itself</p>
              <p className="text-xs text-text-muted">
                When a treatment is recorded, the items on its list are deducted automatically, oldest
                batch first. &ldquo;Used one&rdquo; is only for the odd extra.
              </p>
            </div>
            <details className="w-full">
              <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted">
                See what each treatment uses
              </summary>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <div className="rounded-control border border-border p-3.5">
                  <p className="mb-2 text-[13px] font-semibold text-heading">The lists</p>
                  {templates.length === 0 ? (
                    <p className="text-xs text-text-muted">No treatment lists yet — add one on the right.</p>
                  ) : (
                    templates.map((template) => (
                      <div key={template.id} className="border-t border-border/70 py-2 first:border-t-0 first:pt-0">
                        <p className="text-[13px] font-semibold text-heading">{template.name}</p>
                        <p className="text-xs text-text-muted">
                          {template.items
                            .map((line) => `${nameOf.get(line.inventoryItemId) ?? "item"} × ${line.quantity}`)
                            .join(", ") || "Empty list"}
                        </p>
                      </div>
                    ))
                  )}
                  {templates.length > 0 && (
                    <AuditedActionForm
                      action={applyConsumptionTemplateAction}
                      successMessage="Deducted, oldest batch first."
                      submitLabel="Confirm & deduct stock"
                      pendingLabel="Deducting…"
                      resetOnSuccess
                      className="mt-3 grid gap-2"
                    >
                      <select name="templateId" required className={field}>
                        <option value="">Which treatment was it? *</option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name} · {template.items.length} item(s)
                          </option>
                        ))}
                      </select>
                      <select name="patientId" required className={field}>
                        <option value="">Which patient? *</option>
                        {patients.map((patient) => (
                          <option key={patient.id} value={patient.id}>
                            {patient.fullName}
                          </option>
                        ))}
                      </select>
                      <select name="treatmentPlanId" className={field}>
                        <option value="">Treatment plan (optional)</option>
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.title}
                          </option>
                        ))}
                      </select>
                      <input name="reason" required minLength={8} placeholder="What was done *" className={field} />
                      <label className="flex items-start gap-2 rounded-control border border-border bg-muted p-3 text-xs font-semibold">
                        <input type="checkbox" name="confirmActualConsumption" value="1" required className="mt-0.5" />
                        <span>These items and quantities were actually used for this patient.</span>
                      </label>
                    </AuditedActionForm>
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  <div className="rounded-control border border-border p-3.5">
                    <p className="mb-2 text-[13px] font-semibold text-heading">Add to a treatment&rsquo;s list</p>
                    <AuditedActionForm
                      action={saveConsumptionTemplateAction}
                      successMessage="Saved to the list."
                      submitLabel="Save it"
                      pendingLabel="Saving…"
                      resetOnSuccess
                      className="grid gap-2"
                    >
                      <input name="templateName" required minLength={3} placeholder="List name — e.g. Root canal *" className={field} />
                      <input name="procedureName" required minLength={3} placeholder="Treatment it belongs to *" className={field} />
                      <select name="inventoryItemId" required className={field}>
                        <option value="">Which item *</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <input name="quantity" required type="number" min="1" placeholder="How many each time *" className={field} />
                    </AuditedActionForm>
                  </div>
                  <div className="rounded-control border border-danger-border p-3.5">
                    <p className="mb-1 text-[13px] font-semibold text-danger">Pull a batch off the shelf</p>
                    <p className="mb-2 text-xs text-text-muted">
                      For a recall or anything suspect. It comes out of usable stock straight away; the
                      ledger keeps the full story.
                    </p>
                    {decorated.flatMap((item) =>
                      item.batches.slice(0, 1).map((batch) => (
                        <AuditedActionForm
                          key={batch.id}
                          action={recallInventoryBatchAction}
                          successMessage="Quarantined — out of usable stock."
                          submitLabel="Pull it"
                          pendingLabel="Pulling…"
                          className="grid gap-2 border-t border-border/70 py-2 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]"
                          submitClassName="min-h-10 rounded-control border border-danger-border bg-card px-3 text-xs font-semibold text-danger"
                        >
                          <input type="hidden" name="batchId" value={batch.id} />
                          <div className="text-[13px]">
                            <p className="font-semibold text-heading">{item.name}</p>
                            <p className="text-xs text-text-muted">
                              {batch.batchNumber} · {batch.availableQuantity} {item.unit}
                            </p>
                          </div>
                          <input
                            name="reason"
                            required
                            minLength={8}
                            placeholder="Why it is coming off *"
                            className={field}
                          />
                        </AuditedActionForm>
                      )),
                    )}
                    {decorated.every((item) => item.batches.length === 0) && (
                      <p className="text-xs text-text-muted">No batches on the shelf to pull.</p>
                    )}
                  </div>
                  <div className="rounded-control border border-border p-3.5">
                    <p className="mb-2 text-[13px] font-semibold text-heading">Add a new item to the cupboard</p>
                    <AuditedActionForm
                      action={addInventoryItemAction}
                      successMessage="On the shelf."
                      submitLabel="Add it"
                      pendingLabel="Adding…"
                      resetOnSuccess
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      <input name="name" required placeholder="Name *" className={field} />
                      <input name="category" placeholder="Category" className={field} />
                      <input name="quantity" type="number" min="0" placeholder="Opening quantity" className={field} />
                      <input name="unit" placeholder="Unit — boxes, tubes…" className={field} />
                      <input name="reorderLevel" type="number" min="0" placeholder="Reorder when below" className={field} />
                      <input name="supplier" placeholder="Usual supplier" className={field} />
                      <input name="batchNumber" placeholder="Batch (optional)" className={field} />
                      <input name="expiryDate" type="date" aria-label="Expiry" className={field} />
                    </AuditedActionForm>
                  </div>
                </div>
              </div>
            </details>
          </section>
        </>
      )}

      {tab === "orders" && (
        <section className="rounded-card border border-border bg-card shadow-[var(--shadow)]">
          <div className="px-4.5 pt-3.5 pb-2.5">
            <h2 className="text-base font-semibold text-heading">Orders on the way</h2>
            <p className="text-xs text-text-muted">
              Tick items off as the boxes arrive. Anything short stays open.
            </p>
          </div>
          {orders.length === 0 ? (
            <p className="border-t border-border/70 px-4.5 py-8 text-center text-[13px] text-text-muted">
              Nothing on order. The Order buttons on the Stock tab raise one in a tap.
            </p>
          ) : (
            orders.map((order) => {
              const late = order.expectedDelivery ? overdueBy(order.expectedDelivery, now) : null;
              return (
                <div
                  key={order.id}
                  className={`border-t border-border/70 px-4.5 py-3 ${late ? "border-l-[3px] border-l-danger-mark" : "border-l-[3px] border-l-[#c4a46c]"}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[13px] font-semibold text-heading">
                      {order.supplier}{" "}
                      <span className="font-normal tabular-nums text-text-muted">PO-{order.id}</span>
                    </p>
                    <p
                      className={`text-xs ${late ? "font-semibold text-danger" : "text-text-muted"}`}
                      title={order.expectedDelivery ? exactStamp(order.expectedDelivery) : undefined}
                    >
                      {order.expectedDelivery
                        ? late
                          ? `was due ${humanTime(order.expectedDelivery, now)}`
                          : `arriving ${humanTime(order.expectedDelivery, now)}`
                        : "no promised date"}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-col gap-2.5">
                    {order.items.map((line) => (
                      <div key={line.id} className="rounded-control border border-border p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                          <span className="font-semibold text-heading">{line.inventoryItem.name}</span>
                          <span className="text-text-muted">
                            ordered {line.quantity} · received {line.receivedQuantity}
                          </span>
                        </div>
                        {line.receivedQuantity < line.quantity ? (
                          <AuditedActionForm
                            action={receivePurchaseOrderItemAction}
                            successMessage="Received — the shelf count is updated."
                            submitLabel="It has arrived"
                            pendingLabel="Receiving…"
                            resetOnSuccess
                            className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-5"
                          >
                            <input type="hidden" name="purchaseOrderItemId" value={line.id} />
                            <input
                              required
                              name="receivedQuantity"
                              type="number"
                              min="1"
                              max={line.quantity - line.receivedQuantity}
                              placeholder="How many *"
                              className={field}
                            />
                            <input required name="batchNumber" placeholder="Batch / lot *" className={field} />
                            <input name="expiryDate" type="date" aria-label="Batch expiry" className={field} />
                            <input name="unitCost" type="number" min="0" placeholder="Cost each ₹" className={field} />
                            <input name="storageLocation" placeholder="Where it goes" className={field} />
                          </AuditedActionForm>
                        ) : (
                          <p className="mt-1 text-xs font-semibold text-success">All here</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {tab === "history" && (
        <>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
            {[
              { label: "Spent this month", value: rupees(spent), note: "what came in, at cost", tone: "text-heading" },
              { label: "Used in treatment", value: rupees(used), note: "deducted as work was done", tone: "text-heading" },
              { label: "Thrown away", value: rupees(binned), note: "expired or recalled", tone: binned > 0 ? "text-danger" : "text-heading" },
              { label: "Sitting on the shelf", value: rupees(shelfValue), note: "current stock at cost", tone: "text-heading" },
            ].map((tile) => (
              <div key={tile.label} className="rounded-card border border-border bg-card px-4 py-3.5 shadow-[var(--shadow)]">
                <p className="text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">{tile.label}</p>
                <p className={`text-2xl font-bold tabular-nums ${tile.tone}`}>{tile.value}</p>
                <p className="text-xs text-text-muted">{tile.note}</p>
              </div>
            ))}
          </div>

          <section className="overflow-x-auto rounded-card border border-border bg-card shadow-[var(--shadow)]">
            <div className="min-w-[780px]">
              <div className="px-4.5 pt-3.5 pb-2.5">
                <h2 className="text-base font-semibold text-heading">Everything that moved</h2>
                <p className="text-xs text-text-muted">
                  Who touched what, and why. Nothing here can be edited — only added to.
                </p>
              </div>
              <div className="grid grid-cols-[150px_minmax(160px,1fr)_110px_minmax(160px,1fr)_130px] gap-3 border-b border-border bg-muted px-4.5 py-2.5 text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">
                <span>When</span>
                <span>Item</span>
                <span>Change</span>
                <span>Why</span>
                <span>Who</span>
              </div>
              {movements.length === 0 && (
                <p className="px-4.5 py-8 text-center text-[13px] text-text-muted">No movements yet.</p>
              )}
              {movements.map((move) => (
                <div
                  key={move.id}
                  className="grid grid-cols-[150px_minmax(160px,1fr)_110px_minmax(160px,1fr)_130px] items-center gap-3 border-b border-border/70 px-4.5 py-2.5 text-[13px] last:border-b-0"
                >
                  <span className="text-text-muted" title={exactStamp(move.createdAt)}>
                    {humanTime(move.createdAt, now)}
                  </span>
                  <span className="font-semibold text-heading">{move.inventoryItem.name}</span>
                  <span className={`font-semibold tabular-nums ${move.quantityChange < 0 ? "text-danger" : "text-success"}`}>
                    {move.quantityChange > 0 ? "+" : ""}
                    {move.quantityChange}
                  </span>
                  <span className="text-foreground">{move.reason || move.type.replaceAll("_", " ").toLowerCase()}</span>
                  <span className="text-text-muted">
                    {move.sourceType === "TREATMENT" && !move.actorUserId
                      ? "automatic"
                      : move.actorRole
                        ? move.actorRole.charAt(0) + move.actorRole.slice(1).toLowerCase()
                        : "—"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

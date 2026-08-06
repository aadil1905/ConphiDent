"use client";

import { ScanLine, Sparkles, Stethoscope } from "lucide-react";
import { memo, useCallback, useMemo, useState, useTransition } from "react";
import { saveDentalChartEntriesAction } from "@/app/dashboard/clinical-workspace/actions";

type Entry = { toothNumber: string; condition: string; notes: string | null };
type View = "chart" | "scan" | "insights";

const upperTeeth = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const lowerTeeth = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];

const conditionLabels: Record<string, string> = {
  HEALTHY: "Healthy", CARIES: "Caries", FILLING: "Filling", CROWN: "Crown",
  ROOT_CANAL: "Root canal", MISSING: "Missing", IMPLANT: "Implant", WATCH: "Watch",
};

const conditionShortLabels: Record<string, string> = {
  HEALTHY: "H.", CARIES: "Ca.", FILLING: "Fi.", CROWN: "Cr.",
  ROOT_CANAL: "RC", MISSING: "M.", IMPLANT: "I.", WATCH: "W.",
};

const conditionClasses: Record<string, string> = {
  HEALTHY: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CARIES: "border-rose-200 bg-rose-50 text-rose-700",
  FILLING: "border-sky-200 bg-sky-50 text-sky-700",
  CROWN: "border-violet-200 bg-violet-50 text-violet-700",
  ROOT_CANAL: "border-amber-200 bg-amber-50 text-amber-700",
  MISSING: "border-slate-200 bg-slate-100 text-slate-500",
  IMPLANT: "border-cyan-200 bg-cyan-50 text-cyan-700",
  WATCH: "border-orange-200 bg-orange-50 text-orange-700",
};

const ToothButton = memo(function ToothButton({ tooth, condition, selected, onSelect }: {
  tooth: string; condition: string; selected: boolean; onSelect: (tooth: string, additive: boolean) => void;
}) {
  return <button type="button" onClick={(event) => onSelect(tooth, event.ctrlKey || event.metaKey)}
    className={`inline-flex min-h-[72px] min-w-0 flex-col items-center justify-center rounded-xl border px-1 py-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${conditionClasses[condition] || conditionClasses.HEALTHY} ${selected ? "ring-2 ring-violet-600 ring-offset-2" : ""}`}
    aria-label={`Tooth ${tooth}, ${conditionLabels[condition] || "Healthy"}`}>
    <span className="w-full text-center text-sm font-bold leading-none">{tooth}</span>
    <span className="mt-1 w-full text-center text-[10px] font-semibold leading-none opacity-80">{conditionShortLabels[condition] || "H."}</span>
  </button>;
});

const ToothRow = memo(function ToothRow({ title, teeth, selectedTeeth, entries, onSelect }: {
  title: string; teeth: string[]; selectedTeeth: string[]; entries: Map<string, Entry>; onSelect: (tooth: string, additive: boolean) => void;
}) {
  return <div>
    <div className="mb-2 flex items-center justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
      <p className="text-xs text-slate-400">FDI numbering</p>
    </div>
    <div className="grid grid-cols-8 gap-2 sm:grid-cols-16">
      {teeth.map((tooth) => {
        const entry = entries.get(tooth);
        const condition = entry?.condition || "HEALTHY";
        const selected = selectedTeeth.includes(tooth);
        return <ToothButton key={tooth} tooth={tooth} condition={condition} selected={selected} onSelect={onSelect} />;
      })}
    </div>
  </div>;
});

function SummaryCard({ label, value, tone = "text-slate-900" }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p></div>;
}

export default function DentalChartEditor({ patientId, entries, visitDate, isNewWorkspace = false }: { patientId: number; entries: Entry[]; visitDate: string; isNewWorkspace?: boolean }) {
  const [isSaving, startSaving] = useTransition();
  const [selectedTooth, setSelectedTooth] = useState(entries[0]?.toothNumber || "18");
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([entries[0]?.toothNumber || "18"]);
  const [view, setView] = useState<View>("chart");
  const [scanRun, setScanRun] = useState(false);
  const [optimisticEntries, setOptimisticEntries] = useState(entries);
  const entryMap = useMemo(() => new Map(optimisticEntries.map((entry) => [entry.toothNumber, entry])), [optimisticEntries]);
  const selectedEntry = entryMap.get(selectedTooth);
  const selectedCondition = selectedEntry?.condition || "HEALTHY";
  const values = Array.from(entryMap.values());
  const needsReview = values.filter((entry) => ["CARIES", "WATCH", "ROOT_CANAL"].includes(entry.condition)).length;
  const completedCare = values.filter((entry) => ["FILLING", "CROWN", "ROOT_CANAL", "IMPLANT"].includes(entry.condition)).length;

  const selectTooth = useCallback((tooth: string, additive: boolean) => {
    setSelectedTooth(tooth);
    setSelectedTeeth((current) => additive ? (current.includes(tooth) ? current.filter((item) => item !== tooth) : [...current, tooth]) : [tooth]);
    setView("chart");
  }, []);
  const saveEntries = useCallback((formData: FormData) => {
    const condition = String(formData.get("condition") || "HEALTHY");
    const notes = String(formData.get("notes") || "").trim() || null;
    setOptimisticEntries((current) => {
      const next = new Map(current.map((entry) => [entry.toothNumber, entry]));
      selectedTeeth.forEach((toothNumber) => next.set(toothNumber, { toothNumber, condition, notes }));
      return Array.from(next.values());
    });
    startSaving(async () => {
      await saveDentalChartEntriesAction(formData);
    });
  }, [selectedTeeth]);
  const tabs: Array<{ id: View; label: string; icon: typeof Stethoscope }> = [
    { id: "chart", label: "Chart", icon: Stethoscope }, { id: "scan", label: "Scan", icon: ScanLine }, { id: "insights", label: "Insights", icon: Sparkles },
  ];

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div><h2 className="text-xl font-bold text-slate-900">Dental chart</h2><p className="mt-1 text-sm text-slate-500">Document teeth for the selected visit date. Saved notes automatically appear in Patient Summary.</p></div>
        <div className={`rounded-full px-3 py-1 text-sm font-semibold ${conditionClasses[selectedCondition] || conditionClasses.HEALTHY}`}>Selected tooth {selectedTooth}: {conditionLabels[selectedCondition] || "Healthy"}</div>
      </div>

      <div role="tablist" aria-label="Dental chart tools" className="mt-5 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${view === id ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><Icon className="size-4" />{label}</button>)}
      </div>

      {view === "chart" && <>
        <div className="mt-5 flex flex-wrap gap-2">{Object.entries(conditionLabels).map(([key, label]) => <span key={key} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${conditionClasses[key]}`}>{label}</span>)}</div>
        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:p-5">
          <ToothRow title="Upper jaw" teeth={upperTeeth} selectedTeeth={selectedTeeth} entries={entryMap} onSelect={selectTooth} />
          <div className="my-6 border-t border-dashed border-slate-200" />
          <ToothRow title="Lower jaw" teeth={lowerTeeth} selectedTeeth={selectedTeeth} entries={entryMap} onSelect={selectTooth} />
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Ctrl/Cmd + click adds or removes teeth from the selection. A normal click selects one tooth.</p>
      </>}

      {view === "scan" && <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
        <h3 className="font-semibold text-slate-900">Chart review</h3><p className="mt-1 text-sm text-slate-600">Use this view to review the conditions already recorded in the patient chart. It is not a diagnostic result.</p>
        {!scanRun ? <button type="button" onClick={() => setScanRun(true)} className="mt-4 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-800">Run chart review</button> : <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3"><SummaryCard label="Documented teeth" value={values.length} /><SummaryCard label="Needs review" value={needsReview} tone="text-amber-600" /><SummaryCard label="Care documented" value={completedCare} tone="text-emerald-600" /></div>
          <p className="mt-4 text-sm text-slate-600">Open the chart or select a tooth to review its note and planned treatment.</p>
          <button type="button" onClick={() => setView("chart")} className="mt-3 text-sm font-semibold text-sky-700 hover:text-sky-900">Return to chart</button>
        </>}
      </div>}

      {view === "insights" && <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/60 p-5">
        <h3 className="font-semibold text-slate-900">Clinical chart insights</h3><p className="mt-1 text-sm text-slate-600">A quick summary of recorded information for the selected patient.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><SummaryCard label="Chart entries" value={values.length} /><SummaryCard label="Review items" value={needsReview} tone="text-rose-600" /><SummaryCard label="Completed care" value={completedCare} tone="text-emerald-600" /></div>
        <p className="mt-4 text-sm text-slate-600">Review the patient record and clinical notes before making any clinical decision.</p>
        <button type="button" onClick={() => setView("chart")} className="mt-3 text-sm font-semibold text-violet-700 hover:text-violet-900">Review chart details</button>
      </div>}
    </section>

    <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-xl font-bold text-slate-900">{selectedTeeth.length} selected tooth{selectedTeeth.length === 1 ? "" : "s"}</h2><p className="mt-1 text-sm text-slate-500">Ctrl/Cmd + click teeth, then apply one condition and note to all selected teeth.</p>
      <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Saving under visit date <span className="font-bold">{visitDate}</span>. To save another visit, change the date above first.
      </div>
      <form action={saveEntries} className="mt-6 space-y-4"><input type="hidden" name="patientId" value={patientId} /><input type="hidden" name="toothNumbers" value={selectedTeeth.join(",")} /><input type="hidden" name="visitDate" value={visitDate} />{isNewWorkspace && <input type="hidden" name="allowNewWorkspace" value="1" />}
        <label className="block text-sm font-semibold text-slate-700">Condition<select name="condition" defaultValue={selectedCondition} key={`${selectedTooth}-${selectedCondition}`} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100">{Object.entries(conditionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block text-sm font-semibold text-slate-700">Clinical note<textarea name="notes" defaultValue={selectedEntry?.notes || ""} key={`${selectedTooth}-${selectedEntry?.notes || ""}`} placeholder="Finding, material, advice, or planned treatment" className="mt-2 min-h-36 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" /></label>
        <button type="submit" disabled={isSaving} className="w-full rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 disabled:cursor-wait disabled:opacity-70">{isSaving ? "Saving selected teeth..." : "Save selected teeth"}</button>
      </form>
    </aside>
  </div>;
}

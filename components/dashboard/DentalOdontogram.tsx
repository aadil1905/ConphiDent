"use client";

import { ScanLine, Sparkles, Stethoscope } from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useMemo, useState } from "react";

type Condition = "HEALTHY" | "CARIES" | "FILLING" | "CROWN" | "MISSING";
type View = "chart" | "scan" | "insights";

const upperTeeth = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const lowerTeeth = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];

const conditionMeta: Record<Condition, { label: string; short: string; className: string }> = {
  HEALTHY: { label: "Healthy", short: "H.", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  CARIES: { label: "Caries", short: "Ca.", className: "border-rose-200 bg-rose-50 text-rose-700" },
  FILLING: { label: "Filling", short: "Fi.", className: "border-sky-200 bg-sky-50 text-sky-700" },
  CROWN: { label: "Crown", short: "Cr.", className: "border-violet-200 bg-violet-50 text-violet-700" },
  MISSING: { label: "Missing", short: "M.", className: "border-slate-200 bg-slate-100 text-slate-500" },
};

function demoCondition(tooth: string): Condition { if (tooth === "14") return "CROWN"; if (tooth === "25") return "CARIES"; if (tooth === "36") return "FILLING"; if (tooth === "16" || tooth === "47") return "MISSING"; return "HEALTHY"; }

const ToothRow = memo(function ToothRow({ label, teeth, selectedTooth, onSelect }: { label: string; teeth: readonly string[]; selectedTooth: string; onSelect: (tooth: string) => void }) {
  return <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span><span className="text-xs text-slate-400">FDI numbering</span></div><div className="grid grid-cols-8 gap-2 min-[560px]:grid-cols-16">{teeth.map((tooth) => { const meta = conditionMeta[demoCondition(tooth)]; const selected = tooth === selectedTooth; return <button key={tooth} type="button" onClick={() => onSelect(tooth)} aria-label={`Tooth ${tooth}, ${meta.label}`} className={`inline-flex min-h-[76px] min-w-0 flex-col items-center justify-center rounded-xl border px-1 text-center text-xs shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${meta.className} ${selected ? "ring-2 ring-violet-600 ring-offset-2" : ""}`}><span className="w-full text-center text-base font-bold leading-none">{tooth}</span><span className="mt-1.5 w-full text-center text-[11px] font-semibold leading-none opacity-80">{meta.short}</span></button>; })}</div></div>;
});

export default function DentalOdontogram() {
  const [selectedTooth, setSelectedTooth] = useState("25");
  const [view, setView] = useState<View>("chart");
  const [scanRun, setScanRun] = useState(false);
  const selectTooth = useCallback((tooth: string) => {
    setSelectedTooth(tooth);
    setView("chart");
  }, []);
  const selected = conditionMeta[demoCondition(selectedTooth)];
  const stats = useMemo(() => { const all = [...upperTeeth, ...lowerTeeth].map(demoCondition); return { review: all.filter((condition) => condition === "CARIES").length, completed: all.filter((condition) => condition === "FILLING" || condition === "CROWN").length, missing: all.filter((condition) => condition === "MISSING").length }; }, []);
  const tabs: Array<{ id: View; label: string; icon: typeof Stethoscope }> = [{ id: "chart", label: "Chart", icon: Stethoscope }, { id: "scan", label: "Scan", icon: ScanLine }, { id: "insights", label: "Insights", icon: Sparkles }];
  return <section className="w-full min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-xl font-bold text-slate-900">Dental chart</h2><p className="mt-1 text-sm text-slate-500">A quick clinical overview. Select a tooth for details.</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${selected.className}`}>Tooth {selectedTooth}: {selected.label}</span></div>
    <div role="tablist" aria-label="Dental dashboard chart tools" className="mt-5 flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${view === id ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><Icon className="size-4" />{label}</button>)}</div>
    {view === "chart" && <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/70 p-5"><ToothRow label="Upper jaw" teeth={upperTeeth} selectedTooth={selectedTooth} onSelect={selectTooth} /><div className="my-6 border-t border-dashed border-slate-200" /><ToothRow label="Lower jaw" teeth={lowerTeeth} selectedTooth={selectedTooth} onSelect={selectTooth} /></div>}
    {view === "scan" && <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/70 p-5"><h3 className="font-semibold text-slate-900">Chart review</h3><p className="mt-1 text-sm text-slate-600">Review the conditions currently shown in this dashboard chart. This is not a diagnostic result.</p>{!scanRun ? <button type="button" onClick={() => setScanRun(true)} className="mt-4 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800">Run chart review</button> : <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">Needs review</p><p className="text-2xl font-bold text-rose-600">{stats.review}</p></div><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">Care documented</p><p className="text-2xl font-bold text-emerald-600">{stats.completed}</p></div><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">Missing</p><p className="text-2xl font-bold text-slate-700">{stats.missing}</p></div></div>}</div>}
    {view === "insights" && <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/70 p-5"><h3 className="font-semibold text-slate-900">Clinical insights</h3><p className="mt-1 text-sm text-slate-600">One documented caries item needs review. Two teeth have completed-care markers and two are marked missing in this preview.</p><Link href="/dashboard/clinical-workspace" className="mt-4 inline-block text-sm font-semibold text-violet-700 hover:text-violet-900">Open clinical workspace →</Link></div>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-violet-50 px-4 py-3"><span className="text-sm text-slate-700">Selected tooth <strong>{selectedTooth}</strong> <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${selected.className}`}>{selected.label}</span></span><Link href="/dashboard/clinical-workspace" className="text-sm font-semibold text-violet-700 hover:text-violet-900">Open clinical workspace →</Link></div>
  </section>;
}

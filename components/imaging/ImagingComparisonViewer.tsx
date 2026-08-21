"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { Minus, Move, Plus, RotateCcw, ShieldAlert } from "lucide-react";

type ComparisonImage = { label: string; modality: string; acquiredAt: string; region: string | null; url: string | null; renderable: boolean };

function Pane({ image, zoom, pan, onPointerDown, onPointerMove, onPointerUp }: { image: ComparisonImage; zoom: number; pan: { x: number; y: number }; onPointerDown: (event: React.PointerEvent) => void; onPointerMove: (event: React.PointerEvent) => void; onPointerUp: () => void }) {
  return <section className="overflow-hidden rounded-card border bg-primary"><header className="flex items-center justify-between border-b border-white/10 p-3 text-primary-foreground"><span className="font-bold">{image.label}</span><span className="text-xs text-text-muted">{new Date(image.acquiredAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</span></header><div className="relative grid aspect-square touch-none place-items-center overflow-hidden" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>{image.url && image.renderable ? <img src={image.url} alt={`${image.label} ${image.modality}`} draggable={false} className="h-full w-full select-none object-contain" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} /> : <p className="max-w-xs p-8 text-center text-sm text-text-muted">A certified renderer is required for this original format. Metadata and the preserved original remain accessible.</p>}</div><footer className="border-t border-white/10 p-3 text-xs text-text-muted">{image.modality.replaceAll("_", " ")} · {image.region || "region not recorded"}</footer></section>;
}

export default function ImagingComparisonViewer({ baseline, followup, compatibilityNote, synchronized }: { baseline: ComparisonImage; followup: ComparisonImage; compatibilityNote: string; synchronized: boolean }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  function start(event: React.PointerEvent) { if (!synchronized) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, originX: pan.x, originY: pan.y }; }
  function move(event: React.PointerEvent) { if (!drag.current || !synchronized) return; setPan({ x: drag.current.originX + event.clientX - drag.current.x, y: drag.current.originY + event.clientY - drag.current.y }); }
  function end() { drag.current = null; }
  const paneHandlers = { onPointerDown: start, onPointerMove: move, onPointerUp: end };
  return <div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border bg-card p-3"><div><p className="flex items-center gap-2 text-sm font-bold"><Move className="size-4 text-primary" />{synchronized ? "Synchronized pan and zoom" : "Independent geometry — synchronized controls disabled"}</p><p className="mt-1 text-xs text-text-muted">{compatibilityNote}</p></div>{synchronized ? <div className="flex items-center gap-2"><button type="button" onClick={() => setZoom((value) => Math.max(.5, value - .25))} aria-label="Zoom out both images" className="rounded-control border p-2"><Minus className="size-4" /></button><span className="w-14 text-center text-xs">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(4, value + .25))} aria-label="Zoom in both images" className="rounded-control border p-2"><Plus className="size-4" /></button><button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="inline-flex items-center gap-2 rounded-control border px-3 py-2 text-xs font-semibold"><RotateCcw className="size-4" />Reset</button></div> : null}</div>
    <div className="grid gap-4 lg:grid-cols-2"><Pane image={baseline} zoom={synchronized ? zoom : 1} pan={synchronized ? pan : { x: 0, y: 0 }} {...paneHandlers} /><Pane image={followup} zoom={synchronized ? zoom : 1} pan={synchronized ? pan : { x: 0, y: 0 }} {...paneHandlers} /></div>
    <div className="mt-4 rounded-control border border-warning-border bg-warning-bg p-3 text-sm text-warning"><ShieldAlert className="mr-2 inline size-4" />Not for diagnostic use unless the viewer and display workflow are validated. Window/level controls remain unavailable until a certified renderer proves modality-specific support.</div>
  </div>;
}

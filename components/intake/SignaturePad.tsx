"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

const VIEW_W = 600;
const VIEW_H = 180;

export type SignaturePadHandle = { clear: () => void };

type SignaturePadProps = {
  /** Fires with an SVG data URL after every stroke, and with "" when cleared. */
  onChange: (signature: string) => void;
  invalid?: boolean;
  ref?: React.Ref<SignaturePadHandle>;
};

function toSvg(strokes: number[][][]) {
  const drawn = strokes.filter((stroke) => stroke.length > 1);
  if (!drawn.length) return "";
  const lines = drawn
    .map(
      (stroke) =>
        `<polyline points="${stroke
          .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
          .join(" ")}" fill="none" stroke="#123b5d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}"><rect width="${VIEW_W}" height="${VIEW_H}" fill="white"/>${lines}</svg>`;
  return `data:image/svg+xml;base64,${window.btoa(svg)}`;
}

/**
 * A finger-first signature area. The canvas is scaled by devicePixelRatio so
 * the line is not soft on a phone, and the strokes are kept as points so what
 * gets saved is a crisp SVG rather than a bitmap.
 */
export default function SignaturePad({ onChange, invalid, ref }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<number[][][]>([]);
  const drawingRef = useRef(false);
  const [empty, setEmpty] = useState(true);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const ratio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#123b5d";

    const scaleX = bounds.width / VIEW_W;
    const scaleY = bounds.height / VIEW_H;
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      context.beginPath();
      stroke.forEach(([x, y], index) => {
        const px = x * scaleX;
        const py = y * scaleY;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.stroke();
    }
  }, []);

  const clear = useCallback(() => {
    strokesRef.current = [];
    drawingRef.current = false;
    setEmpty(true);
    repaint();
    onChange("");
  }, [repaint, onChange]);

  useImperativeHandle(ref, () => ({ clear }), [clear]);

  // Resizing changes the backing store, so the strokes have to be redrawn.
  useEffect(() => {
    repaint();
    window.addEventListener("resize", repaint);
    return () => window.removeEventListener("resize", repaint);
  }, [repaint]);

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(VIEW_W, ((event.clientX - bounds.left) / bounds.width) * VIEW_W)),
      Math.max(0, Math.min(VIEW_H, ((event.clientY - bounds.top) / bounds.height) * VIEW_H)),
    ];
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    strokesRef.current = [...strokesRef.current, [pointAt(event)]];
    if (empty) setEmpty(false);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const last = strokesRef.current[strokesRef.current.length - 1];
    last.push(pointAt(event));
    repaint();
  };

  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange(toSvg(strokesRef.current));
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`relative overflow-hidden rounded-control border bg-white ${
          invalid ? "border-danger-mark" : "border-[rgba(23,107,135,0.18)]"
        }`}
      >
        <canvas
          ref={canvasRef}
          aria-label="Signature area — draw with your finger, or use the type-it option below"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="block h-40 w-full cursor-crosshair touch-none"
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[15px] text-[#8fa8b4]">
            Draw your signature here
          </span>
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute right-3.5 bottom-8 left-3.5 h-px bg-[rgba(23,107,135,0.18)]"
        />
      </div>
      <button
        type="button"
        onClick={clear}
        className="min-h-12 self-start rounded-control border border-[rgba(23,107,135,0.25)] bg-white px-3.5 text-[15px] font-semibold text-heading"
      >
        Start again
      </button>
    </div>
  );
}

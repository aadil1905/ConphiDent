"use client";

import { motion, useInView, useReducedMotion } from "./Motion";
import { useRef } from "react";

/**
 * The claim "one patient record underneath" drawn, rather than asserted.
 *
 * The section it sits in lists eleven modules in a grid, which shows what the
 * product has and not that any of it is joined up. This draws the join: every
 * module on a spoke, one record at the hub, and the connectors drawing inward
 * so the eye finishes in the middle.
 *
 * **It is `aria-hidden`.** The diagram carries no information the page does not
 * already state — the grid immediately below names every module in text, and
 * the heading states the relationship. A screen reader gets that instead of a
 * described picture of it, which is the better version of the same content.
 *
 * Geometry is computed once at module scope from an index, so it is identical
 * on the server and the client. Nothing here is random.
 */

const MODULES = [
  "Patients", "Appointments", "Charting", "Prescriptions", "Billing",
  "WhatsApp", "Laboratory", "Imaging", "Inventory", "Reports",
] as const;

const W = 920;
const H = 460;
const CX = W / 2;
const CY = H / 2;
const RX = 355;
const RY = 168;

/** Even spread around the ellipse, starting at the top. */
const nodes = MODULES.map((label, index) => {
  const angle = (index / MODULES.length) * Math.PI * 2 - Math.PI / 2;
  return {
    label,
    x: +(CX + Math.cos(angle) * RX).toFixed(2),
    y: +(CY + Math.sin(angle) * RY).toFixed(2),
    // Labels on the left half read outward to the left.
    anchor: (Math.cos(angle) < -0.25 ? "end" : Math.cos(angle) > 0.25 ? "start" : "middle") as "end" | "start" | "middle",
  };
});

export default function ConnectedRecord() {
  const reduced = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const play = inView && !reduced;

  return (
    <figure className="mk-web" aria-hidden="true">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="mk-web-svg" role="presentation" focusable="false">
        {/* Spokes first so the nodes sit on top of their own lines. */}
        {nodes.map((node, index) => (
          <motion.line
            key={`line-${node.label}`}
            x1={node.x} y1={node.y} x2={CX} y2={CY}
            className="mk-web-line"
            initial={reduced ? undefined : { pathLength: 0, opacity: 0 }}
            animate={play ? { pathLength: 1, opacity: 1 } : undefined}
            transition={{ duration: 0.5, delay: 0.15 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}

        {nodes.map((node, index) => (
          <motion.g
            key={node.label}
            initial={reduced ? undefined : { opacity: 0, scale: 0.9 }}
            animate={play ? { opacity: 1, scale: 1 } : undefined}
            transition={{ duration: 0.35, delay: 0.2 + index * 0.05 }}
            style={{ transformOrigin: `${node.x}px ${node.y}px` }}
          >
            <circle cx={node.x} cy={node.y} r="6" className="mk-web-node" />
            <text
              x={node.anchor === "end" ? node.x - 14 : node.anchor === "start" ? node.x + 14 : node.x}
              y={node.y + (node.anchor === "middle" ? (node.y < CY ? -16 : 24) : 5)}
              textAnchor={node.anchor}
              className="mk-web-label"
            >
              {node.label}
            </text>
          </motion.g>
        ))}

        <motion.g
          initial={reduced ? undefined : { opacity: 0, scale: 0.92 }}
          animate={play ? { opacity: 1, scale: 1 } : undefined}
          transition={{ duration: 0.45, delay: 0.7 }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        >
          <rect x={CX - 118} y={CY - 34} width="236" height="68" rx="16" className="mk-web-hub" />
          <text x={CX} y={CY - 4} textAnchor="middle" className="mk-web-hub-label">One patient record</text>
          <text x={CX} y={CY + 18} textAnchor="middle" className="mk-web-hub-sub">every module writes here</text>
        </motion.g>
      </svg>
    </figure>
  );
}

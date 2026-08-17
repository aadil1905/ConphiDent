"use client";

/**
 * Animated interface illustrations.
 *
 * These replace the pre-Phase-B PNG screenshots, which showed a UI the product
 * no longer ships. They are stylised depictions of each module drawn in SVG and
 * CSS — not literal screen captures — so every caption calls them interface
 * illustrations rather than product previews.
 */

import {
  Activity,
  CalendarDays,
  Check,
  FlaskConical,
  IndianRupee,
  Package,
  Scan,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { motion, useReducedMotion, Counter, EASE } from "./Motion";

export type VisualKind =
  | "today" | "schedule" | "patients" | "clinical"
  | "money" | "laboratory" | "imaging" | "operations" | "insights";

const CHROME: Record<VisualKind, string> = {
  today: "Today", schedule: "Schedule", patients: "Patients", clinical: "Clinical workspace",
  money: "Billing", laboratory: "Laboratory", imaging: "Imaging", operations: "Operations", insights: "Insights",
};

/** Shared window chrome so every illustration reads as the same product. */
export function ProductVisual({ kind, caption }: { kind: VisualKind; caption?: string }) {
  return (
    <figure className="mk-frame mk-visual">
      <div className="mk-window-bar"><i /><i /><i /><span>ConphiDent · {CHROME[kind]}</span></div>
      <div className="mk-visual-body">{renderVisual(kind)}</div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function renderVisual(kind: VisualKind) {
  switch (kind) {
    case "today": return <TodayVisual />;
    case "schedule": return <ScheduleVisual />;
    case "patients": return <PatientsVisual />;
    case "clinical": return <ClinicalVisual />;
    case "money": return <MoneyVisual />;
    case "laboratory": return <LaboratoryVisual />;
    case "imaging": return <ImagingVisual />;
    case "operations": return <OperationsVisual />;
    case "insights": return <InsightsVisual />;
  }
}

/** Rows fade up in sequence; reduced motion renders them settled. */
function useRowMotion() {
  const reduced = useReducedMotion();
  return (index: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "0px 0px -8% 0px" },
          transition: { duration: 0.4, delay: index * 0.06, ease: EASE },
        };
}

/* --- Today ---------------------------------------------------------------- */

function TodayVisual() {
  const row = useRowMotion();
  const stats = [
    { icon: CalendarDays, label: "Visits today", value: 24 },
    { icon: UserRound, label: "New patients", value: 6 },
    { icon: IndianRupee, label: "Collected", value: 48200, prefix: "₹" },
  ];
  const agenda = [
    ["09:30", "Aarav Mehta", "Root canal · Dr Deepika", "Checked in"],
    ["10:15", "Priya Nair", "Scaling · Dr Rohan", "Confirmed"],
    ["11:00", "Imran Shaikh", "Crown fitting · Dr Deepika", "Waiting"],
    ["11:45", "Sana Kulkarni", "Consultation · Dr Rohan", "Confirmed"],
  ];

  return (
    <div className="mk-vs-stack">
      <div className="mk-vs-stats">
        {stats.map((stat, index) => (
          <motion.div key={stat.label} className="mk-vs-stat" {...row(index)}>
            <span className="mk-vs-ico"><stat.icon /></span>
            <b><Counter to={stat.value} prefix={stat.prefix ?? ""} /></b>
            <small>{stat.label}</small>
          </motion.div>
        ))}
      </div>
      <div className="mk-vs-list">
        {agenda.map(([time, name, detail, status], index) => (
          <motion.div key={name} className="mk-vs-row" {...row(index + 3)}>
            <em>{time}</em>
            <span className="mk-vs-dot" />
            <div><b>{name}</b><small>{detail}</small></div>
            <i className={`mk-vs-pill ${status === "Checked in" ? "is-good" : ""}`}>{status}</i>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* --- Schedule -------------------------------------------------------------- */

function ScheduleVisual() {
  const reduced = useReducedMotion();
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // [column, row-start, span, tone]
  const blocks: Array<[number, number, number, string]> = [
    [0, 0, 2, "a"], [0, 3, 1, "b"], [1, 1, 2, "b"], [2, 0, 1, "c"],
    [2, 2, 2, "a"], [3, 1, 1, "a"], [3, 3, 2, "c"], [4, 0, 2, "b"],
    [5, 2, 1, "a"],
  ];

  return (
    <div className="mk-vs-cal">
      <div className="mk-vs-cal-head">{days.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="mk-vs-cal-grid">
        {days.map((day) => (
          <div key={day} className="mk-vs-cal-col">
            {[0, 1, 2, 3, 4].map((slot) => <i key={slot} className="mk-vs-cal-slot" />)}
          </div>
        ))}
        {blocks.map(([col, start, span, tone], index) => (
          <motion.div
            key={`${col}-${start}`}
            className={`mk-vs-cal-block tone-${tone}`}
            style={{ gridColumn: col + 1, gridRow: `${start + 1} / span ${span}` }}
            initial={reduced ? false : { opacity: 0, scaleY: 0.6 }}
            whileInView={{ opacity: 1, scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: index * 0.05, ease: EASE }}
          />
        ))}
      </div>
    </div>
  );
}

/* --- Patients -------------------------------------------------------------- */

function PatientsVisual() {
  const row = useRowMotion();
  const timeline = [
    ["12 Aug", "Consultation", "Upper right quadrant sensitivity noted"],
    ["04 Aug", "Scaling & polishing", "Completed · invoice settled"],
    ["21 Jul", "X-ray", "OPG uploaded to the record"],
    ["10 Jul", "Intake", "Medical history and allergies recorded"],
  ];

  return (
    <div className="mk-vs-stack">
      <motion.div className="mk-vs-patient" {...row(0)}>
        <span className="mk-vs-avatar">AM</span>
        <div>
          <b>Aarav Mehta</b>
          <small>34 · +91 98••• ••210 · Patient #1042</small>
        </div>
        <i className="mk-vs-pill is-good">Active</i>
      </motion.div>
      <div className="mk-vs-tabrow">
        {["Overview", "Clinical", "Plans", "Invoices", "X-rays"].map((tab, index) => (
          <motion.span key={tab} className={index === 0 ? "is-on" : ""} {...row(index + 1)}>{tab}</motion.span>
        ))}
      </div>
      <div className="mk-vs-timeline">
        {timeline.map(([date, title, detail], index) => (
          <motion.div key={date} className="mk-vs-tl-row" {...row(index + 3)}>
            <em>{date}</em>
            <div><b>{title}</b><small>{detail}</small></div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* --- Clinical (dental arch) ------------------------------------------------ */

function ClinicalVisual() {
  const reduced = useReducedMotion();
  // Findings keyed by tooth index so the legend and the chart cannot disagree.
  const findings: Record<number, string> = { 3: "caries", 6: "restored", 11: "caries", 20: "watch", 26: "restored" };
  const tone = { caries: "#b3454f", restored: "#0e7490", watch: "#c08a2e" };

  const tooth = (index: number, row: "upper" | "lower") => {
    const state = findings[index];
    const x = (index % 16) * 30 + 12;
    const y = row === "upper" ? 14 : 78;
    // A gentle arch: teeth at the ends sit slightly lower than the centre.
    const lift = Math.abs(index % 16 - 7.5) * 1.6;
    return (
      <motion.g
        key={`${row}-${index}`}
        initial={reduced ? false : { opacity: 0, y: row === "upper" ? -6 : 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.35, delay: (index % 16) * 0.025, ease: EASE }}
      >
        <rect
          x={x}
          y={y + (row === "upper" ? lift : -lift)}
          width={22}
          height={26}
          rx={7}
          fill={state ? tone[state as keyof typeof tone] : "#eef6f8"}
          stroke={state ? "none" : "#cfe2e7"}
          strokeWidth={1}
        />
      </motion.g>
    );
  };

  return (
    <div className="mk-vs-stack">
      <svg viewBox="0 0 500 130" className="mk-vs-arch" role="img" aria-label="Dental chart illustration with example findings marked">
        {Array.from({ length: 16 }, (_, i) => tooth(i, "upper"))}
        {Array.from({ length: 16 }, (_, i) => tooth(i + 16, "lower"))}
      </svg>
      <div className="mk-vs-legend">
        <span><i style={{ background: tone.caries }} />Caries</span>
        <span><i style={{ background: tone.restored }} />Restored</span>
        <span><i style={{ background: tone.watch }} />Watch</span>
        <span><i style={{ background: "#eef6f8", border: "1px solid #cfe2e7" }} />Healthy</span>
      </div>
      <div className="mk-vs-note">
        <b>Clinical note · 12 Aug</b>
        <p>Sensitivity on 16 to cold. Advised desensitising paste, review in three weeks. Plan raised for restoration on 26.</p>
      </div>
    </div>
  );
}

/* --- Money ---------------------------------------------------------------- */

function MoneyVisual() {
  const row = useRowMotion();
  const reduced = useReducedMotion();
  const lines = [
    ["Root canal treatment · 16", "6,500"],
    ["Composite restoration · 26", "2,400"],
    ["Consultation", "500"],
  ];

  return (
    <div className="mk-vs-stack">
      <motion.div className="mk-vs-invoice-head" {...row(0)}>
        <div><b>Invoice INV-2026-0184</b><small>Aarav Mehta · 12 Aug 2026</small></div>
        <motion.i
          className="mk-vs-stamp"
          initial={reduced ? false : { opacity: 0, scale: 1.3, rotate: -12 }}
          whileInView={{ opacity: 1, scale: 1, rotate: -8 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.5, ease: EASE }}
        >
          Paid
        </motion.i>
      </motion.div>
      <div className="mk-vs-lines">
        {lines.map(([label, amount], index) => (
          <motion.div key={label} className="mk-vs-line" {...row(index + 1)}>
            <span>{label}</span><em>₹{amount}</em>
          </motion.div>
        ))}
        <motion.div className="mk-vs-line is-total" {...row(4)}>
          <span>Total received</span><em>₹<Counter to={9400} /></em>
        </motion.div>
      </div>
      <motion.div className="mk-vs-payrow" {...row(5)}>
        <span><Check /> Payment recorded · UPI</span>
        <span><Check /> Receipt sent on WhatsApp</span>
      </motion.div>
    </div>
  );
}

/* --- Laboratory ------------------------------------------------------------ */

function LaboratoryVisual() {
  const row = useRowMotion();
  const cases = [
    ["Zirconia crown", "Aarav Mehta", "Due in 2 days", 70, "is-good"],
    ["Cast partial denture", "Sana Kulkarni", "Due in 5 days", 40, ""],
    ["Night guard", "Imran Shaikh", "Overdue", 25, "is-late"],
  ];

  return (
    <div className="mk-vs-stack">
      <div className="mk-vs-list">
        {cases.map(([title, patient, due, pct, tone], index) => (
          <motion.div key={title as string} className="mk-vs-case" {...row(index)}>
            <span className="mk-vs-ico"><FlaskConical /></span>
            <div>
              <b>{title}</b>
              <small>{patient} · shade A2</small>
              <span className="mk-vs-bar">
                <motion.i
                  initial={{ width: 0 }}
                  whileInView={{ width: `${pct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: 0.15 + index * 0.1, ease: EASE }}
                />
              </span>
            </div>
            <i className={`mk-vs-pill ${tone}`}>{due}</i>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* --- Imaging --------------------------------------------------------------- */

function ImagingVisual() {
  const reduced = useReducedMotion();
  return (
    <div className="mk-vs-stack">
      <div className="mk-vs-xray">
        {/* A stylised radiograph: paired roots along an arch, not a real image. */}
        <svg viewBox="0 0 420 150" role="img" aria-label="Radiograph viewer illustration">
          <defs>
            <linearGradient id="xr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#12333d" /><stop offset="100%" stopColor="#071c23" />
            </linearGradient>
          </defs>
          <rect width="420" height="150" fill="url(#xr)" />
          {Array.from({ length: 14 }, (_, i) => (
            <g key={i} opacity={0.85}>
              <rect x={16 + i * 28} y={44 - Math.abs(i - 6.5) * 1.4} width={18} height={24} rx={6} fill="#9fc6d1" opacity={0.55} />
              <rect x={21 + i * 28} y={68 - Math.abs(i - 6.5) * 1.4} width={8} height={26} rx={4} fill="#7ba7b3" opacity={0.4} />
            </g>
          ))}
          {!reduced && (
            <motion.rect
              y="0" width="46" height="150" fill="rgba(103,232,249,.16)"
              initial={{ x: -46 }}
              animate={{ x: 420 }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "linear", repeatDelay: 1.4 }}
            />
          )}
        </svg>
      </div>
      <div className="mk-vs-thumbs">
        {["OPG · 21 Jul", "IOPA 16 · 12 Aug", "Bitewing · 12 Aug"].map((label, index) => (
          <motion.span
            key={label}
            className={index === 1 ? "is-on" : ""}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: index * 0.08, ease: EASE }}
          >
            <Scan />{label}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

/* --- Operations ------------------------------------------------------------ */

function OperationsVisual() {
  const row = useRowMotion();
  const items = [
    ["Composite A2 syringe", 82, "In stock"],
    ["Lignocaine 2% vials", 34, "Reorder soon"],
    ["Disposable bibs", 12, "Low stock"],
    ["Gutta-percha points", 64, "In stock"],
  ];

  return (
    <div className="mk-vs-list">
      {items.map(([name, level, status], index) => (
        <motion.div key={name as string} className="mk-vs-stock" {...row(index)}>
          <span className="mk-vs-ico"><Package /></span>
          <div>
            <b>{name}</b>
            <span className="mk-vs-bar">
              <motion.i
                className={(level as number) < 20 ? "is-late" : (level as number) < 40 ? "is-warn" : ""}
                initial={{ width: 0 }}
                whileInView={{ width: `${level}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.1 + index * 0.08, ease: EASE }}
              />
            </span>
          </div>
          <i className={`mk-vs-pill ${(level as number) < 20 ? "is-late" : ""}`}>{status}</i>
        </motion.div>
      ))}
    </div>
  );
}

/* --- Insights -------------------------------------------------------------- */

function InsightsVisual() {
  const reduced = useReducedMotion();
  const bars = [46, 62, 51, 78, 66, 92, 74];
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="mk-vs-stack">
      <div className="mk-vs-stats">
        <div className="mk-vs-stat"><span className="mk-vs-ico"><TrendingUp /></span><b><Counter to={186} /></b><small>Visits this month</small></div>
        <div className="mk-vs-stat"><span className="mk-vs-ico"><IndianRupee /></span><b>₹<Counter to={412000} /></b><small>Collected</small></div>
        <div className="mk-vs-stat"><span className="mk-vs-ico"><Activity /></span><b><Counter to={38} />%</b><small>Enquiries booked</small></div>
      </div>
      <div className="mk-vs-chart" role="img" aria-label="Illustrative weekly activity chart">
        {bars.map((height, index) => (
          <span key={labels[index]}>
            <motion.i
              initial={reduced ? false : { height: 0 }}
              whileInView={{ height: `${height}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.06, ease: EASE }}
              style={reduced ? { height: `${height}%` } : undefined}
            />
            <em>{labels[index]}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, Tilt, EASE } from "./Motion";
import { ProductVisual, type VisualKind } from "./ProductVisuals";
import WhatsAppThread from "./WhatsAppThread";

const panels: Array<{
  id: string; label: string; title: string; problem: string; visible: string; why: string;
  visual: VisualKind | "whatsapp-thread";
}> = [
  { id: "dashboard", label: "Today", title: "Open on what needs you right now.", problem: "The day's appointments, follow-ups and money signals live in separate places, so nobody starts from the same picture.", visible: "Appointments, patient activity, clinical overview, collections and front-desk priorities.", why: "Everyone opens the same operating picture.", visual: "today" },
  { id: "patients", label: "Patients", title: "Keep the whole patient context together.", problem: "Details, visits and care records get hard to follow once they are spread across tools.", visible: "Patient details, visit dates, clinical workspace, plans, invoices and action shortcuts.", why: "The record becomes the centre of the journey.", visual: "patients" },
  { id: "appointments", label: "Schedule", title: "Scheduling that carries its context.", problem: "A calendar alone cannot carry the reason for the visit, the patient history or the next message.", visible: "Clinic diary, visit times, appointment status and patient-linked booking details.", why: "The front desk coordinates capacity with less switching.", visual: "schedule" },
  { id: "clinical", label: "Clinical", title: "Give every clinical decision its context.", problem: "Tooth findings, notes and plans should not be scattered across separate records.", visible: "Visit-linked dental chart, findings, clinical notes and patient summary access.", why: "Care decisions stay traceable and connected.", visual: "clinical" },
  { id: "billing", label: "Money", title: "Connect care delivered to money received.", problem: "Disconnected billing makes balances harder to explain and harder to chase.", visible: "Invoice line items, payment capture, receipt actions and outstanding balance.", why: "Finance context stays attached to the patient.", visual: "money" },
  { id: "whatsapp", label: "WhatsApp", title: "Turn communication into accountable work.", problem: "Messages and reminders are unreliable when nobody can see delivery or ownership.", visible: "Scheduled queue, delivery status, failures and outbound history.", why: "Patient communication becomes observable and actionable.", visual: "whatsapp-thread" },
  { id: "laboratory", label: "Laboratory", title: "Track lab work inside the patient journey.", problem: "Manual lab coordination makes due dates, rework and case ownership hard to follow.", visible: "Case creation, patient, lab, material, shade, due date, priority and status metrics.", why: "The clinic sees what is due before it slips.", visual: "laboratory" },
  { id: "imaging", label: "Imaging", title: "Keep every radiograph with its patient.", problem: "X-rays stored on a machine or a shared drive are hard to find and impossible to compare.", visible: "Patient-linked studies, upload and review, and side-by-side comparison.", why: "The image sits in the record, not in a folder.", visual: "imaging" },
  { id: "inventory", label: "Operations", title: "Make stock movement visible.", problem: "Expiry, low stock and purchase needs only become urgent when they are tracked by hand.", visible: "Inventory operations, stock movement and purchasing controls.", why: "Teams act before essential supplies run out.", visual: "operations" },
  { id: "reports", label: "Insights", title: "Turn clinic activity into decisions.", problem: "Static spreadsheets make it hard to spot what needs attention now.", visible: "Appointment, revenue, follow-up and performance reporting from connected records.", why: "Clinic leaders move from reporting to action.", visual: "insights" },
];

export default function PlatformExplorer() {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panel = panels[active];

  /** A tablist must be arrow-navigable, not click-only. */
  function onTabKey(event: React.KeyboardEvent) {
    const forward = event.key === "ArrowRight";
    const back = event.key === "ArrowLeft";
    if (!forward && !back) return;
    event.preventDefault();
    const next = (active + (forward ? 1 : -1) + panels.length) % panels.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="mk-section on-tint" id="platform-overview">
      <div className="cf-wrap">
        <div className="mk-section-heading">
          <p className="mk-kicker">Platform overview</p>
          <h2 className="t-h2">Nine places the clinic day actually happens.</h2>
          <p className="t-lead">
            Every preview below is the real ConphiDent product with sanitized demonstration data.
            Pick an area to see the workflow and the operational problem it addresses.
          </p>
        </div>

        <div className="mk-tabs" role="tablist" aria-label="Product areas" onKeyDown={onTabKey}>
          {panels.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => { tabRefs.current[index] = node; }}
              id={`tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={active === index}
              aria-controls="platform-panel"
              tabIndex={active === index ? 0 : -1}
              onClick={() => setActive(index)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mk-panel" id="platform-panel" role="tabpanel" aria-labelledby={`tab-${panel.id}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${panel.id}-copy`}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <p className="mk-kicker">{panel.label}</p>
              <h3>{panel.title}</h3>
              <dl className="mk-deflist">
                <div><dt>Problem solved</dt><dd>{panel.problem}</dd></div>
                <div><dt>What you can see</dt><dd>{panel.visible}</dd></div>
                <div><dt>Why it matters</dt><dd>{panel.why}</dd></div>
              </dl>
            </motion.div>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${panel.id}-visual`}
              initial={reduced ? false : { opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.32, ease: EASE }}
            >
              {/* The same camera as the hero, so depth reads as a property of
                  the product frames rather than a trick used once. The WhatsApp
                  thread is left flat: it is a conversation being read, and
                  rotating running text is the one thing depth must not do. */}
              {panel.visual === "whatsapp-thread"
                ? <WhatsAppThread />
                : (
                  <Tilt className="mk-explorer-stage" max={5}>
                    <ProductVisual kind={panel.visual} caption={`Interface illustration · ${panel.label}`} />
                  </Tilt>
                )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

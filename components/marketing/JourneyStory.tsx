"use client";

import { Check } from "lucide-react";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, EASE } from "./Motion";
import { useMotionValueEvent } from "motion/react";
import { ProductVisual, type VisualKind } from "./ProductVisuals";
import WhatsAppThread from "./WhatsAppThread";

const stages: Array<{
  label: string; problem: string; feature: string; outcome: string;
  visual: VisualKind | "whatsapp-thread";
}> = [
  { label: "Enquiry", problem: "New enquiries get lost inside scattered conversations.", feature: "The WhatsApp inbox and lead queue keep the first message visible, owned and actionable.", outcome: "Every enquiry has a clear next step.", visual: "whatsapp-thread" },
  { label: "Appointment", problem: "Manual scheduling separates the booking from the patient it belongs to.", feature: "The diary connects patient, treatment, provider and visit timing in one booking.", outcome: "A confirmed visit carries its context forward.", visual: "schedule" },
  { label: "Consultation", problem: "Clinical findings drift away from the rest of the patient journey.", feature: "The clinical workspace links visit history, dental charting and notes to the record.", outcome: "Chairside decisions stay patient-linked.", visual: "clinical" },
  { label: "Treatment", problem: "Treatment planning means rebuilding context from separate records.", feature: "Plans, prescriptions and tooth-level findings live with the patient record.", outcome: "The next care action is clear to the team.", visual: "patients" },
  { label: "Payment", problem: "Finance should not have to chase clinical context to raise a bill.", feature: "Patient-linked invoices, payments and balances follow the care that was delivered.", outcome: "Treatment and payment stay connected.", visual: "money" },
  { label: "Follow-up", problem: "Patients disappear when follow-up work has no owner and no visible queue.", feature: "Follow-up tasks and WhatsApp actions organize the work between visits.", outcome: "Every journey ends with a next action.", visual: "today" },
];

export default function JourneyStory() {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  useMotionValueEvent(scrollYProgress, "change", (progress: number) => {
    const index = Math.min(stages.length - 1, Math.floor(progress * stages.length));
    setActive(index < 0 ? 0 : index);
  });

  const stage = stages[active];

  return (
    <>
      {/* Pinned scroll story — desktop only; the CSS hides it under 780px. */}
      <section ref={ref} className="mk-journey on-ink" id="workflow" aria-label="Connected patient journey">
        <div className="mk-journey-pin">
          <div className="cf-wrap">
            <div className="mk-section-heading">
              <p className="mk-kicker">Connected patient journey</p>
              <h2 className="t-h2">One patient. One story. Every stage connected.</h2>
            </div>

            <div className="mk-journey-stage">
              <div>
                <div className="mk-rail" aria-hidden="true">
                  {stages.map((item, index) => (
                    <span key={item.label}>
                      <motion.i
                        initial={false}
                        animate={{ width: index <= active ? "100%" : "0%" }}
                        transition={{ duration: reduced ? 0 : 0.4, ease: EASE }}
                      />
                    </span>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={stage.label}
                    initial={reduced ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
                    transition={{ duration: 0.3, ease: EASE }}
                  >
                    <p className="mk-stage-count">0{active + 1} / 0{stages.length}</p>
                    <h3 className="t-h2" style={{ margin: "10px 0 22px" }}>{stage.label}</h3>
                    <dl className="mk-deflist">
                      <div><dt>Clinic problem</dt><dd>{stage.problem}</dd></div>
                      <div><dt>ConphiDent connects</dt><dd>{stage.feature}</dd></div>
                      <div className="mk-outcome"><dt><Check /> Outcome</dt><dd>{stage.outcome}</dd></div>
                    </dl>
                  </motion.div>
                </AnimatePresence>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={stage.label}
                  initial={reduced ? false : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.34, ease: EASE }}
                >
                  {stage.visual === "whatsapp-thread"
                    ? <WhatsAppThread />
                    : <ProductVisual kind={stage.visual} caption={`Interface illustration · ${stage.label}`} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {/* Stacked equivalent for small screens, where pinning fights the scroll. */}
      <section className="mk-journey-stacked on-ink" aria-label="Connected patient journey">
        <div className="cf-wrap">
          <div className="mk-section-heading">
            <p className="mk-kicker">Connected patient journey</p>
            <h2 className="t-h2">One patient. One story. Every stage connected.</h2>
          </div>
          {stages.map((item, index) => (
            <article key={item.label} className="mk-stacked-stage">
              <p className="mk-stage-count">0{index + 1} / 0{stages.length}</p>
              <h3 className="t-h3">{item.label}</h3>
              <p className="t-body">{item.problem}</p>
              <p className="t-body"><strong style={{ color: "#fff" }}>{item.outcome}</strong></p>
              {item.visual === "whatsapp-thread"
                ? <WhatsAppThread />
                : <ProductVisual kind={item.visual} caption={`Interface illustration · ${item.label}`} />}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

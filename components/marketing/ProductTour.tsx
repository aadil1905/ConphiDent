"use client";

import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const stages = [
  { label: "Enquiry", problem: "New enquiries are easy to lose inside scattered conversations.", feature: "Lead CRM and WhatsApp context keep the first message visible and actionable.", outcome: "Every enquiry has a clear next step.", image: "/product/crm/lead-crm-demo.png", alt: "ConphiDent lead CRM with fictional enquiry data" },
  { label: "Appointment", problem: "Manual scheduling separates the booking from the patient context.", feature: "The clinic calendar connects patient, treatment, provider and visit timing.", outcome: "A confirmed visit carries its context forward.", image: "/product/appointments/calendar-demo.png", alt: "ConphiDent appointment calendar using fictional demo data" },
  { label: "Consultation", problem: "Clinical findings can become detached from the rest of the patient journey.", feature: "The clinical workspace links visit history, dental charting and notes.", outcome: "Chairside decisions remain patient-linked.", image: "/product/clinical/clinical-workspace-demo.png", alt: "ConphiDent clinical workspace and dental chart using fictional demo data" },
  { label: "Treatment", problem: "Treatment planning often requires rebuilding context from separate records.", feature: "Plans, prescriptions and tooth-level findings live with the patient record.", outcome: "The next care action is clear to the team.", image: "/product/patients/patient-profile-demo.png", alt: "ConphiDent connected patient record using fictional demo data" },
  { label: "Payment", problem: "Finance teams should not need to chase clinical context.", feature: "Patient-linked invoices, payments and balances follow completed care.", outcome: "Treatment and payment stay connected.", image: "/product/billing/billing-invoice-demo.png", alt: "ConphiDent invoice and payment workspace using fictional demo data" },
  { label: "Follow-up", problem: "Patients disappear when follow-up work has no owner or visible queue.", feature: "Follow-up tasks and WhatsApp actions organize the work between visits.", outcome: "Every patient journey ends with a next action.", image: "/product/crm/followups-demo.png", alt: "ConphiDent follow-up queue using fictional demo data" },
];

export default function ProductTour() {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<"before" | "active" | "after">("before");
  const stage = stages[active];

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const section = sectionRef.current;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      setPhase(rect.top > 0 ? "before" : rect.bottom <= window.innerHeight ? "after" : "active");
      const range = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = Math.max(0, Math.min(0.999, -rect.top / range));
      setActive(Math.min(stages.length - 1, Math.floor(progress * stages.length)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, []);

  return <section ref={sectionRef} className="mk-journey" id="workflow" aria-label="Connected patient journey">
    <div className={`mk-journey-sticky is-${phase}`}><div className="cf-wrap">
      <div className="mk-section-heading"><p className="mk-kicker">Connected patient journey</p><h2>One patient. One story. Every stage connected.</h2><p>Scroll through a real clinic journey—from the first enquiry to the next follow-up.</p></div>
      <div className="mk-journey-grid">
        <div className="mk-journey-copy" aria-live="polite"><div className="mk-progress" aria-hidden="true">{stages.map((item, index) => <span key={item.label} className={index <= active ? "is-active" : ""}/>)}</div><p className="mk-stage-count">0{active + 1} / 0{stages.length}</p><h3>{stage.label}</h3><dl><div><dt>Clinic problem</dt><dd>{stage.problem}</dd></div><div><dt>ConphiDent connects</dt><dd>{stage.feature}</dd></div><div className="mk-outcome"><dt><Check/> Outcome</dt><dd>{stage.outcome}</dd></div></dl></div>
        <figure className="mk-product-frame"><div className="mk-window-bar"><i/><i/><i/><span>ConphiDent · fictional demonstration data</span></div>{stages.map((item, index) => <Image key={item.image} src={item.image} alt={item.alt} width={1171} height={1180} sizes="(max-width: 900px) 92vw, 58vw" className={index === active ? "is-active" : ""} priority={index === 0}/>) }<div className="mk-image-callout"><b>{stage.label}</b><span>{stage.outcome}</span><ArrowRight/></div></figure>
      </div>
    </div></div>
    <div className="mk-journey-mobile cf-wrap">
      <div className="mk-section-heading"><p className="mk-kicker">Connected patient journey</p><h2>One patient. One story. Every stage connected.</h2><p>Follow the same patient from the first enquiry to the next follow-up.</p></div>
      {stages.map((item, index) => <article key={item.label} className="mk-mobile-stage">
        <div><p className="mk-stage-count">0{index + 1} / 0{stages.length}</p><h3>{item.label}</h3><p>{item.problem}</p><strong>{item.outcome}</strong></div>
        <figure className="mk-product-frame"><div className="mk-window-bar"><i/><i/><i/><span>ConphiDent · fictional demonstration data</span></div><Image src={item.image} alt={item.alt} width={1171} height={1180} sizes="92vw" loading="lazy"/></figure>
      </article>)}
    </div>
  </section>;
}

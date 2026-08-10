"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function DemoForm() {
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  async function submit(formData: FormData) {
    setState("sending");
    try {
      const result = await fetch("/api/demo-requests", { method: "POST", body: formData });
      setState(result.ok ? "success" : "error");
      if (result.ok) (document.getElementById("demo-request-form") as HTMLFormElement | null)?.reset();
    } catch { setState("error"); }
  }
  if (state === "success") return <div className="cf-form-success" role="status"><CheckCircle2/><h3>Your demo request is in.</h3><p>Thank you—our team will contact you shortly to arrange a convenient time.</p><button type="button" onClick={() => setState("idle")}>Send another request</button></div>;
  return <form id="demo-request-form" className="cf-demo-form" action={submit} aria-describedby="demo-form-note"><p id="demo-form-note" className="cf-form-note">Please do not include patient health information. All fields are required.</p><input className="cf-honeypot" name="companyWebsite" tabIndex={-1} autoComplete="off" aria-hidden="true"/><label>Name<input name="name" required minLength={2} autoComplete="name" placeholder="Your full name"/></label><label>Clinic name<input name="clinicName" required minLength={2} placeholder="Your clinic"/></label><label>Phone<input name="phone" required minLength={7} type="tel" autoComplete="tel" placeholder="Your mobile number"/></label><label>Email<input name="email" required type="email" autoComplete="email" placeholder="you@clinic.com"/></label><label>City<input name="city" required minLength={2} autoComplete="address-level2" placeholder="Your city"/></label><label>Number of doctors<select name="doctorCount" required defaultValue=""><option value="" disabled>Select team size</option><option>1</option><option>2–5</option><option>6–15</option><option>16+</option></select></label><label className="cf-form-wide">Preferred time<select name="preferredTime" required defaultValue=""><option value="" disabled>When should we contact you?</option><option>Morning (9 AM – 12 PM)</option><option>Afternoon (12 PM – 4 PM)</option><option>Evening (4 PM – 7 PM)</option></select></label>{state === "error" && <p className="cf-form-error" role="alert">We couldn&apos;t send that request. Please try again or use WhatsApp.</p>}<button disabled={state === "sending"} className="mk-button" type="submit">{state === "sending" ? "Sending…" : "Book my demo"}<ArrowRight/></button></form>;
}

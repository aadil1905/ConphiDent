"use client";

import { useEffect, useRef, useState } from "react";

declare global { interface Window { FB?: { init: (options: Record<string, unknown>) => void; login: (callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>) => void } } }

type SignupAssets = { wabaId?: string; phoneNumberId?: string; businessId?: string };

export function ConnectWhatsAppButton() {
  const [, setAssets] = useState<SignupAssets>({});
  const assetsRef = useRef<SignupAssets>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP" || data?.event !== "FINISH") return;
        const next = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id, businessId: data.data?.business_id };
        assetsRef.current = next;
        setAssets(next);
      } catch { /* Ignore non-JSON messages from the popup. */ }
    };
    window.addEventListener("message", onMessage);
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.onload = () => window.FB?.init({ appId, cookie: true, xfbml: false, version: "v25.0" });
    document.body.appendChild(script);
    return () => { window.removeEventListener("message", onMessage); script.remove(); };
  }, [appId]);

  const connect = () => {
    if (!appId || !configId) { setMessage("WhatsApp onboarding is not enabled by the platform owner yet."); return; }
    if (!window.FB) { setMessage("Meta is still loading. Please try again in a moment."); return; }
    setLoading(true); setMessage(undefined); assetsRef.current = {}; setAssets({});
    window.FB.login(async (response) => {
      const code = response.authResponse?.code;
      // Meta posts the WABA/phone IDs separately from the OAuth code. Small retries avoid a race between the two callbacks.
      for (let attempt = 0; code && attempt < 10; attempt += 1) {
        const current = attempt === 0 ? assetsRef.current : await new Promise<SignupAssets>((resolve) => setTimeout(() => resolve({ ...assetsRef.current }), 250));
        if (current.wabaId && current.phoneNumberId) {
          const result = await fetch("/api/whatsapp/embedded-signup/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, ...current }) });
          const payload = await result.json() as { error?: string };
          setLoading(false); setMessage(result.ok ? "WhatsApp is connected and ready to receive messages." : payload.error ?? "Could not complete WhatsApp connection.");
          return;
        }
      }
      setLoading(false); setMessage("Meta signup did not finish. Please complete every step and try again.");
    }, { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, sessionInfoVersion: "3" } });
  };

  return <div className="space-y-3"><button type="button" onClick={connect} disabled={loading} className="rounded-control bg-[#1877f2] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#166fe5] disabled:opacity-60">{loading ? "Connecting…" : "Connect WhatsApp"}</button>{message && <p role="status" className="text-[length:var(--text-secondary)] text-text-muted">{message}</p>}</div>;
}

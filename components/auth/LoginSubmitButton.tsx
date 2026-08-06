"use client";

import { useFormStatus } from "react-dom";

export default function LoginSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="login-submit-button h-12 w-full rounded-xl bg-cyan-700 font-semibold text-white shadow-lg shadow-cyan-900/15 transition hover:bg-cyan-800 focus:outline-none focus:ring-4 focus:ring-cyan-100 disabled:pointer-events-none disabled:opacity-80"
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span className="login-submit-spinner" />
          Signing in...
        </span>
      ) : (
        "Sign in"
      )}
    </button>
  );
}

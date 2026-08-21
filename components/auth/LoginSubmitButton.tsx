"use client";

import { useFormStatus } from "react-dom";

export default function LoginSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="login-submit-button h-12 w-full rounded-control bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-80"
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

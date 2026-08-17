"use client";

import { useEffect } from "react";
import { clearAllDrafts } from "@/lib/local-draft";

/**
 * Wipes every on-device draft, mounted on the login screen.
 *
 * Drafts used to survive signing out. `logoutAction` is a server action — it
 * deletes the session row and the cookie and cannot touch `localStorage` — so
 * on a shared operatory machine the next person to sign in inherited whatever
 * the last one had half-typed. The login screen is where every sign-out lands
 * and where nobody is authenticated, which makes it the one place a blanket
 * wipe is unambiguously correct.
 *
 * It also clears the three retired global keys, so a device already carrying
 * one from before this change is cleaned on the next sign-in rather than
 * holding it indefinitely.
 */
export default function ClearLocalDrafts() {
  useEffect(() => {
    clearAllDrafts();
  }, []);

  return null;
}

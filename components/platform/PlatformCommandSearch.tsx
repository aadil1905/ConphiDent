"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, Search, X } from "lucide-react";

function SearchSubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-disabled={pending} className="platform-button platform-button--primary platform-search-submit">
    {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
    <span>{pending ? "Searching…" : "Search"}</span>
  </button>;
}

/** Native-dialog command surface. Results remain permission-filtered server-side. */
export function PlatformCommandSearch() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const openDialog = () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  const closeDialog = () => {
    dialogRef.current?.close();
    setOpen(false);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openDialog();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <>
    <button type="button" onClick={openDialog} className="platform-search-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls="platform-search-dialog">
      <Search aria-hidden="true" className="size-4" /><span>Search Control Center</span><kbd>Ctrl K</kbd>
    </button>
    <dialog
      id="platform-search-dialog"
      ref={dialogRef}
      onClose={() => setOpen(false)}
      onClick={(event) => { if (event.target === event.currentTarget) closeDialog(); }}
      aria-labelledby="platform-search-title"
      aria-describedby="platform-search-description"
      aria-modal="true"
      className="platform-search-dialog"
    >
      <div className="platform-search-panel">
        <div className="platform-search-heading">
          <div><p className="platform-eyebrow">Permission-aware search</p><h2 id="platform-search-title">Find platform records</h2></div>
          <button type="button" onClick={closeDialog} aria-label="Close search" className="platform-dialog-close"><X className="size-5" aria-hidden="true" /></button>
        </div>
        <form action="/platform/search" className="platform-search-form">
          <label className="sr-only" htmlFor="platform-search-query">Search permitted clinics, users, subscriptions, and phone numbers</label>
          <div className="platform-search-field">
            <Search className="size-4" aria-hidden="true" />
            <input ref={inputRef} id="platform-search-query" name="q" maxLength={80} required autoComplete="off" enterKeyHint="search" placeholder="Clinic, user email, plan, or phone number" />
          </div>
          <SearchSubmitButton />
          <p id="platform-search-description">Only records allowed by your platform role are returned. Patient records and message content are never searched here.</p>
        </form>
      </div>
    </dialog>
  </>;
}

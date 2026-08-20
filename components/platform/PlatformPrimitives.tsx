import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Info, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function PlatformPageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <header className="platform-page-header"><div className="platform-page-header__copy"><p className="platform-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="platform-page-description">{description}</p></div>{actions && <div className="platform-page-actions">{actions}</div>}</header>;
}

export function PlatformCard({ title, description, icon: Icon, children, className }: { title?: string; description?: string; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return <section className={cn("platform-card", className)}>{(title || description || Icon) && <header className="platform-card__header"><div className="flex items-center gap-3">{Icon && <span className="platform-card__icon"><Icon className="size-4" aria-hidden="true" /></span>}{title && <h2>{title}</h2>}</div>{description && <p>{description}</p>}</header>}<div className="platform-card__content">{children}</div></section>;
}

const toneClasses = { success: "platform-status--success", warning: "platform-status--warning", danger: "platform-status--danger", info: "platform-status--info", neutral: "platform-status--neutral" } as const;
export function PlatformStatus({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof toneClasses }) { return <span className={cn("platform-status", toneClasses[tone])}>{children}</span>; }

const stateIcons = { empty: Info, error: AlertCircle, offline: WifiOff, success: CheckCircle2 } as const;
export function PlatformState({ state = "empty", title, description, action }: { state?: keyof typeof stateIcons; title: string; description: string; action?: { href: string; label: string } }) { const Icon = stateIcons[state]; return <div className={`platform-state platform-state--${state}`} role={state === "error" ? "alert" : "status"}><span className="platform-state__icon"><Icon className="size-5" aria-hidden="true" /></span><div><p>{title}</p><span>{description}</span>{action && <Link href={action.href}>{action.label}</Link>}</div></div>; }

export function PlatformSkeleton({ className }: { className?: string }) { return <div className={cn("platform-skeleton", className)} aria-hidden="true"/>; }

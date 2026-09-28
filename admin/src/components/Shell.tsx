import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", match: (p: string) => p === "/" },
  {
    to: "/playground",
    label: "Playground",
    match: (p: string) => p.startsWith("/playground"),
  },
  { to: "/inbox", label: "Inbox", match: (p: string) => p.startsWith("/inbox") },
  {
    to: "/handoffs",
    label: "Handoffs",
    match: (p: string) => p.startsWith("/handoffs"),
  },
  {
    to: "/knowledge",
    label: "Knowledge",
    match: (p: string) => p.startsWith("/knowledge"),
  },
  {
    to: "/actions",
    label: "Actions",
    match: (p: string) => p.startsWith("/actions"),
  },
  {
    to: "/behaviour",
    label: "Behaviour",
    match: (p: string) => p.startsWith("/behaviour"),
  },
  {
    to: "/settings",
    label: "Settings",
    match: (p: string) => p.startsWith("/settings"),
  },
] as const;

const BRAND_MARK = (
  <svg
    className="brand-mark-live block size-[28px] shrink-0 text-[var(--ink)]"
    viewBox="0 0 64 64"
    aria-hidden
    focusable="false"
  >
    <path
      d="M17 6h30a11 11 0 0 1 11 11v26a11 11 0 0 1-11 11H24l-11 9V52.7A11 11 0 0 1 6 43V17A11 11 0 0 1 17 6z"
      fill="currentColor"
    />
    <rect x="28.5" y="27" width="7" height="19" rx="3.5" fill="var(--paper)" />
    <circle cx="32" cy="18" r="5" fill="var(--signal)" />
  </svg>
);

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // SPA shell is prerendered at mask path `/` — keep chrome route-neutral
  // while generating that shell so deep-link fallback HTML stays generic.
  const isShell = router.isShell();
  const activePath = isShell ? null : pathname;
  const activeLabel =
    (activePath && NAV.find((item) => item.match(activePath))?.label) ||
    "Admin";

  return (
    <div className="grid min-h-svh md:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="app-rail sticky top-0 z-10 flex h-auto flex-col border-b border-[var(--line)] px-3.5 pb-4 pt-5 md:h-svh md:border-b-0 md:border-r">
        <Link
          to="/"
          className="group inline-flex items-center gap-2.5 px-2 text-[var(--ink)] no-underline"
          aria-label="iHello admin"
        >
          {BRAND_MARK}
          <span className="flex min-w-0 flex-col leading-none">
            <span className="text-[18px] font-medium tracking-[-0.03em]">
              iHello
            </span>
            <span className="mt-1 font-mono text-[10px] font-medium tracking-[0.08em] text-[var(--ink-3)] uppercase">
              Admin
            </span>
          </span>
        </Link>

        <p className="mono-label mb-2.5 mt-9 px-2.5 font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
          Workspace
        </p>
        <nav aria-label="Admin" className="grid gap-0.5">
          {NAV.map((item) => {
            const active = activePath ? item.match(activePath) : false;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-10 items-center justify-between gap-2 rounded-[10px] px-2.5 text-left text-[14px] font-medium text-[var(--ink-3)] no-underline transition-[color,background-color,transform] duration-200 hover:bg-[var(--paper-3)] hover:text-[var(--ink)]",
                  active &&
                    "bg-[var(--paper)] text-[var(--ink)] shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_8px_20px_-16px_rgba(18,19,26,0.45)] ring-1 ring-[var(--line)]",
                )}
              >
                {active ? (
                  <span
                    aria-hidden
                    className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--signal)]"
                  />
                ) : null}
                <span className="min-w-0 truncate pl-0.5">{item.label}</span>
                {active ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--signal)]" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden border-t border-[var(--line)] pt-4 md:block">
          <div className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-2.5 rounded-[10px] bg-[var(--paper)]/70 px-2.5 py-2.5 ring-1 ring-[var(--line)]">
            <span className="grid size-8 place-items-center rounded-[8px] bg-[var(--ink)] font-mono text-[11px] text-[var(--paper)]">
              IH
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-[var(--ink)]">
                Site chat
              </span>
              <span className="mt-px block truncate font-mono text-[10px] tracking-[0.02em] text-[var(--ink-3)]">
                Live agent
              </span>
            </span>
          </div>
        </div>
      </aside>

      <div className="app-canvas min-w-0">
        <header className="sticky top-0 z-10 flex min-h-[58px] items-center justify-between gap-3 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--paper)_78%,transparent)] px-5 py-3 backdrop-blur-md md:px-10">
          <span className="min-w-0 truncate text-[14px]">
            <span className="font-medium tracking-[-0.02em] text-[var(--ink)]">
              iHello
            </span>
            <span className="mx-1.5 text-[var(--ink-3)]">/</span>
            <span className="text-[var(--ink-2)]">{activeLabel}</span>
          </span>
          <span className="inline-flex h-[28px] items-center gap-2 rounded-full bg-[var(--signal-tint)] px-3 font-mono text-[11px] font-medium tracking-[0.06em] text-[var(--signal-deep)] uppercase">
            <span className="status-dot-pulse size-1.5 rounded-full bg-current" />
            Live
          </span>
        </header>
        <section className="page-enter mx-auto max-w-[1280px] px-5 pb-24 pt-10 md:px-10 md:pt-14">
          {children}
        </section>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  kicker,
  title,
  description,
  action,
  className,
}: {
  kicker: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-4",
        className,
      )}
    >
      <div className="max-w-[640px] space-y-2.5">
        <p className="mono-label font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
          {kicker}
        </p>
        <h1 className="text-[30px] font-medium tracking-[-0.035em] text-[var(--ink)] md:text-[34px]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-[48ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 pb-0.5">{action}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-start gap-3 px-6 py-10">
      <div
        aria-hidden
        className="grid size-9 place-items-center rounded-[8px] bg-[var(--signal-tint)]"
      >
        <span className="size-2 rounded-full bg-[var(--signal)]" />
      </div>
      <div className="space-y-1.5">
        <p className="text-[15px] font-medium text-[var(--ink)]">{title}</p>
        <p className="max-w-[42ch] text-[14px] leading-relaxed text-[var(--ink-2)]">
          {body}
        </p>
      </div>
      {action}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div className="whitespace-pre-wrap rounded-[10px] border border-[var(--rose)] bg-[var(--rose)]/35 px-3.5 py-2.5 text-[13px] font-medium text-[var(--rose-ink)]">
      {message}
    </div>
  );
}

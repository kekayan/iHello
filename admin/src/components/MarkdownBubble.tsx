import { ChatBubbleLoader } from "@/components/ChatBubbleLoader";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

type Props = {
  content: string;
  className?: string;
  streaming?: boolean;
  /** Text status e.g. "Searching for relevant information…" */
  activity?: string | null;
  /** Bouncing dots before activity text is known */
  loadingDots?: boolean;
};

/** Assistant bubble with safe markdown. User bubbles stay plain text elsewhere. */
export function MarkdownBubble({
  content,
  className,
  streaming,
  activity,
  loadingDots,
}: Props) {
  const empty = !content.trim();

  if (empty && loadingDots) {
    return (
      <div className={cn("markdown-bubble", className)}>
        <ChatBubbleLoader />
      </div>
    );
  }

  if (empty && activity) {
    return (
      <div
        className={cn(
          "markdown-bubble animate-[rise-in_0.25s_ease-out]",
          className,
        )}
      >
        <span className="activity-status inline-flex items-center gap-2" role="status">
          <span className="activity-orb-mini" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="activity-orb-dot" style={{ ["--i" as string]: i }} />
            ))}
          </span>
          <span className="activity-shimmer">{activity}</span>
        </span>
      </div>
    );
  }

  const html = renderMarkdown(content || (streaming ? "…" : ""));
  return (
    <div
      className={cn(
        "markdown-bubble [&_a]:underline [&_a]:underline-offset-2",
        "[&_p]:my-0 [&_p+p]:mt-2",
        "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4",
        "[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4",
        "[&_li]:my-0.5",
        "[&_code]:rounded [&_code]:bg-black/8 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/8 [&_pre]:p-2",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_h1]:text-[1.05em] [&_h1]:font-semibold [&_h2]:text-[1.02em] [&_h2]:font-semibold [&_h3]:font-semibold",
        "[&_strong]:font-semibold",
        empty && streaming && "animate-[rise-in_0.2s_ease-out]",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

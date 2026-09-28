import { cn } from "@/lib/utils";

/** Three-dot pulse shown before activity text arrives. */
export function ChatBubbleLoader({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex items-center gap-1 py-0.5", className)}
      aria-label="Loading"
    >
      <span
        className="size-[7px] rounded-full bg-[#8b969e] animate-[chat-dot_1.2s_ease-in-out_infinite]"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="size-[7px] rounded-full bg-[#8b969e] animate-[chat-dot_1.2s_ease-in-out_infinite]"
        style={{ animationDelay: "160ms" }}
      />
      <span
        className="size-[7px] rounded-full bg-[#8b969e] animate-[chat-dot_1.2s_ease-in-out_infinite]"
        style={{ animationDelay: "320ms" }}
      />
    </div>
  );
}

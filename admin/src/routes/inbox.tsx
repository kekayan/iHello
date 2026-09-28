import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { api, ts, type Conversation, type Message } from "@/lib/api";
import { MarkdownBubble } from "@/components/MarkdownBubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, FormError, PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inbox")({
  component: InboxPage,
  validateSearch: (search: Record<string, unknown>) => ({
    conv: typeof search.conv === "string" ? search.conv : undefined,
  }),
});

function shortVisitorId(visitorId: string | null | undefined): string {
  const id = (visitorId || "").trim();
  if (!id) return "—";
  return id.slice(0, 8);
}

function InboxPage() {
  const { conv } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { toast } = useToast();
  const [rows, setRows] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function refreshList() {
    const d = await api<{ conversations: Conversation[] }>("/api/conversations");
    setRows(d.conversations || []);
  }

  useEffect(() => {
    refreshList().catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    setConfirmDelete(false);
  }, [conv]);

  useEffect(() => {
    if (!conv) {
      setMessages(null);
      setLoadingMessages(false);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    setMessages(null);
    api<{ messages: Message[] }>(`/api/conversations/${encodeURIComponent(conv)}`)
      .then((d) => {
        if (!cancelled) setMessages(d.messages || []);
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conv]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => {
      const visitor = (c.visitor_id || "").toLowerCase();
      const page = (c.page_url || "").toLowerCase();
      return visitor.includes(q) || page.includes(q);
    });
  }, [rows, filter]);

  const selected = rows.find((c) => c.id === conv) || null;

  async function deleteConversation() {
    if (!conv) return;
    setDeleting(true);
    setErr(null);
    try {
      await api(`/api/conversations/${encodeURIComponent(conv)}`, {
        method: "DELETE",
      });
      setConfirmDelete(false);
      setMessages(null);
      await navigate({ search: { conv: undefined } });
      await refreshList();
      toast("Conversation deleted");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Workspace"
        title="Inbox"
        description="Open a conversation to read the transcript."
      />
      {err ? <FormError message={err} /> : null}
      {rows.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          body="Once the widget is live, chats show up here. Preview traffic stays out of this list."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] lg:gap-5">
          <section className="surface overflow-hidden">
            <div className="space-y-3 border-b border-[var(--line)] px-5 py-3.5">
              <h2 className="text-[15px] font-medium tracking-[-0.01em]">
                Conversations
              </h2>
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by visitor id or page URL…"
                className="h-9 rounded-[10px] bg-[var(--paper)] text-[13px]"
                aria-label="Filter conversations"
              />
            </div>
            {filtered.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-[var(--ink-3)]">
                No conversations match this filter.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {filtered.map((c) => {
                  const isSelected = conv === c.id;
                  const shortId = shortVisitorId(c.visitor_id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => navigate({ search: { conv: c.id } })}
                        className={cn(
                          "flex w-full flex-col gap-1 px-5 py-3.5 text-left transition-colors hover:bg-[var(--paper-3)]/60",
                          isSelected && "bg-[var(--signal-tint)]/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="tabular-nums text-[13px] font-medium text-[var(--ink)]">
                            {ts(c.started_at)}
                          </span>
                          <span className="font-mono text-[11px] text-[var(--ink-3)] tabular-nums">
                            {c.message_count} msgs
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-fit rounded-full bg-[var(--paper-3)] px-2 py-0.5 font-mono text-[10px] tracking-[0.02em] text-[var(--ink-3)]"
                            title={c.visitor_id || "No visitor id"}
                          >
                            {shortId}
                          </span>
                          {c.handoff_id ? (
                            <span className="w-fit rounded-full bg-[var(--paper-3)] px-2 py-0.5 font-mono text-[10px] tracking-[0.04em] text-[var(--ink-3)] uppercase">
                              Handoff
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate text-[13px] text-[var(--ink-2)]">
                          {c.page_url || "—"}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="surface flex min-h-[320px] flex-col overflow-hidden">
            {conv ? (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-3.5">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-medium tracking-[-0.01em]">
                      Transcript
                    </h2>
                    {selected ? (
                      <div className="mt-1 space-y-0.5">
                        <p className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-2)]">
                          <span
                            className="rounded-full bg-[var(--paper-3)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink-3)]"
                            title={selected.visitor_id || "No visitor id"}
                          >
                            {shortVisitorId(selected.visitor_id)}
                          </span>
                          <span className="truncate">
                            {selected.page_url || "—"}
                          </span>
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="flex gap-2">
                      {!confirmDelete ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-[10px] text-[var(--ink-2)] hover:text-destructive"
                          onClick={() => setConfirmDelete(true)}
                        >
                          Delete conversation
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-[10px]"
                        onClick={() => {
                          setConfirmDelete(false);
                          navigate({ search: { conv: undefined } });
                        }}
                      >
                        Close
                      </Button>
                    </div>
                    {confirmDelete ? (
                      <div className="max-w-[280px] rounded-[12px] border border-[var(--line)] bg-[var(--paper)] p-3 text-left shadow-sm">
                        <p className="text-[13px] leading-snug text-[var(--ink-2)]">
                          Delete this conversation and all its messages? This
                          cannot be undone.
                        </p>
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-[10px]"
                            disabled={deleting}
                            onClick={() => setConfirmDelete(false)}
                          >
                            Keep conversation
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="rounded-[10px]"
                            disabled={deleting}
                            onClick={() => void deleteConversation()}
                          >
                            {deleting ? "Deleting…" : "Delete permanently"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
                  {loadingMessages ? (
                    <p className="text-[13px] text-[var(--ink-3)]">Loading messages…</p>
                  ) : messages && messages.length === 0 ? (
                    <p className="text-[13px] text-[var(--ink-3)]">No messages in this conversation.</p>
                  ) : messages ? (
                    <div className="flex flex-col gap-3">
                      {messages.map((m, i) => {
                        if (m.role === "user") {
                          return (
                            <div
                              key={`${m.role}-${i}`}
                              className="max-w-[85%] self-end rounded-[18px] rounded-br-[8px] bg-[#0c1418] px-3.5 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-white"
                            >
                              {m.content}
                            </div>
                          );
                        }
                        if (m.role === "assistant") {
                          return (
                            <div key={`${m.role}-${i}`} className="max-w-[85%] self-start">
                              <MarkdownBubble
                                content={m.content}
                                className="rounded-[18px] rounded-bl-[8px] bg-[#e8ecef] px-3.5 py-2.5 text-[14.5px] leading-relaxed text-[#0c1418]"
                              />
                              {m.grounded_score != null ? (
                                <p className="mt-1 font-mono text-[10px] text-[var(--ink-3)]">
                                  g={m.grounded_score}
                                </p>
                              ) : null}
                            </div>
                          );
                        }
                        return (
                          <p
                            key={`${m.role}-${i}`}
                            className="self-center text-center text-[12px] text-[var(--ink-3)]"
                          >
                            {m.content}
                          </p>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center px-5 py-10">
                <p className="text-[14px] text-[var(--ink-3)]">
                  Pick a conversation from the list.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, ts, type Conversation, type Message } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState, FormError, PageHeader } from "@/components/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/inbox")({
  component: InboxPage,
  validateSearch: (search: Record<string, unknown>) => ({
    conv: typeof search.conv === "string" ? search.conv : undefined,
  }),
});

function InboxPage() {
  const { conv } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [rows, setRows] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ conversations: Conversation[] }>("/api/conversations")
      .then((d) => setRows(d.conversations || []))
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!conv) {
      setMessages(null);
      return;
    }
    api<{ messages: Message[] }>(`/api/conversations/${encodeURIComponent(conv)}`)
      .then((d) => setMessages(d.messages || []))
      .catch((e: Error) => setErr(e.message));
  }, [conv]);

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
        <div className="surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Page</TableHead>
                <TableHead>Msgs</TableHead>
                <TableHead>Handoff</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="tabular-nums">{ts(c.started_at)}</TableCell>
                  <TableCell>{c.page_url || "—"}</TableCell>
                  <TableCell className="tabular-nums">{c.message_count}</TableCell>
                  <TableCell>{c.handoff_id ? "Yes" : ""}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate({ search: { conv: c.id } })}
                    >
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {messages ? (
        <pre className="surface max-h-90 overflow-auto p-4 font-mono text-[13px] leading-[19px] whitespace-pre-wrap text-[var(--ink-2)]">
          {messages
            .map(
              (m) =>
                `${m.role}: ${m.content}${
                  m.grounded_score != null ? ` [g=${m.grounded_score}]` : ""
                }`,
            )
            .join("\n\n")}
        </pre>
      ) : null}
    </div>
  );
}

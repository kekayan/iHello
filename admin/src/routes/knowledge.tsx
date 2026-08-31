import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Gap } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { EmptyState, FormError, PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/knowledge")({
  component: KnowledgePage,
});

function KnowledgePage() {
  const { toast } = useToast();
  const [status, setStatus] = useState("Index status: —");
  const [files, setFiles] = useState<string[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const s = await api<{ result?: unknown }>("/api/knowledge/status");
      setStatus("Index status: " + JSON.stringify(s.result ?? s));
    } catch {
      setStatus("Index status: unavailable");
    }
    try {
      const f = await api<{
        result?: Array<{ key?: string; name?: string; id?: string }>;
        files?: Array<{ key?: string; name?: string; id?: string }>;
      }>("/api/knowledge/files");
      const list = f.result || f.files || [];
      setFiles(list.map((x) => x.key || x.name || x.id || "").filter(Boolean));
    } catch {
      setFiles([]);
    }
    try {
      const g = await api<{ gaps: Gap[] }>("/api/gaps");
      setGaps(g.gaps || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Knowledge"
        title="Knowledge"
        description="Documents in the index, and questions the agent couldn’t ground."
        action={
          <Button
            type="button"
            size="sm"
            className="rounded-[10px]"
            onClick={async () => {
              await api("/api/knowledge/sync", { method: "POST", body: "{}" });
              toast("Re-index started");
              void load();
            }}
          >
            Re-index
          </Button>
        }
      />
      {err ? <FormError message={err} /> : null}
      <p className="mono-label font-mono text-[12px] text-[var(--ink-3)]">{status}</p>

      {files.length === 0 ? (
        <EmptyState
          title="No documents yet"
          body="Add markdown below or upload a file so the agent can ground answers."
        />
      ) : (
        <div className="surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((key) => (
                <TableRow key={key}>
                  <TableCell className="font-medium">{key}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await api(`/api/knowledge/files/${encodeURIComponent(key)}`, {
                          method: "DELETE",
                        });
                        toast("Removed");
                        void load();
                      }}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="surface space-y-3 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="doc-name">Filename</Label>
          <Input
            id="doc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="about.md"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-body">Markdown</Label>
          <Textarea
            id="doc-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="# About..."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="rounded-[10px]"
            onClick={async () => {
              await api("/api/knowledge/files", {
                method: "POST",
                body: JSON.stringify({ filename: name, content: body }),
              });
              toast("Added");
              setName("");
              setBody("");
              void load();
            }}
          >
            Add document
          </Button>
          <Input
            type="file"
            className="max-w-xs"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.append("file", file, file.name);
              const res = await fetch("/api/knowledge/files", {
                method: "POST",
                body: fd,
              });
              if (!res.ok) throw new Error(await res.text());
              toast("Uploaded");
              void load();
            }}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="mono-label font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
          Coverage gaps
        </h2>
        {gaps.length === 0 ? (
          <EmptyState
            title="No gaps yet"
            body="Low-score answers will show up here so you know what to add."
          />
        ) : (
          <div className="surface overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Page</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gaps.map((g, i) => (
                  <TableRow key={`${g.question}-${i}`}>
                    <TableCell>{g.question || ""}</TableCell>
                    <TableCell className="tabular-nums">{g.score ?? ""}</TableCell>
                    <TableCell>{g.page || ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

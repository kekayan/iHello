import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HANDOFF_STATUSES, api, type Handoff } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { EmptyState, FormError, PageHeader } from "@/components/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/handoffs")({
  component: HandoffsPage,
});

function HandoffsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Handoff[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const d = await api<{ handoffs: Handoff[] }>("/api/handoffs");
      setRows(d.handoffs || []);
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
        kicker="Workspace"
        title="Handoffs"
        description="People waiting on a reply — update status as you go."
        action={
          <Button variant="outline" size="sm" asChild className="rounded-[10px]">
            <a href="/api/handoffs.csv">Download CSV</a>
          </Button>
        }
      />
      {err ? <FormError message={err} /> : null}
      {rows.length === 0 ? (
        <EmptyState
          title="No handoffs yet"
          body="When the agent escalates, leads land here so you can track status."
        />
      ) : (
        <div className="surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Pillar</TableHead>
                <TableHead>Timeline</TableHead>
                <TableHead>Scale</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{h.type}</TableCell>
                  <TableCell>{h.email || ""}</TableCell>
                  <TableCell>{h.pillar || ""}</TableCell>
                  <TableCell>{h.timeline || ""}</TableCell>
                  <TableCell>{h.scale || ""}</TableCell>
                  <TableCell>{h.summary || ""}</TableCell>
                  <TableCell>
                    <Select
                      value={h.status}
                      onValueChange={async (status) => {
                        if (!status) return;
                        await api(`/api/handoffs/${encodeURIComponent(h.id)}`, {
                          method: "PATCH",
                          body: JSON.stringify({ status }),
                        });
                        toast("Updated");
                        void load();
                      }}
                    >
                      <SelectTrigger size="sm" className="w-[8.5rem] rounded-full bg-secondary border-transparent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HANDOFF_STATUSES.map((st) => (
                          <SelectItem key={st} value={st}>
                            {st}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

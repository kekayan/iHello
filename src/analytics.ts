export type Outcome =
  | "chat"
  | "lead"
  | "support"
  | `refused_${string}`
  | `declined_${string}`;

export interface TurnEvent {
  page_url: string;
  intent: string;
  model: string;
  outcome: Outcome;
  source: string;
  ttft_ms: number;
  total_ms: number;
  retrieval_top_score: number;
  grounded_score: number;
  grounded_commit: number;
  conversation_id: string;
}

export function writeEvent(ae: AnalyticsEngineDataset, event: TurnEvent): void {
  ae.writeDataPoint({
    blobs: [event.page_url, event.intent, event.model, event.outcome, event.source],
    doubles: [
      event.ttft_ms,
      event.total_ms,
      event.retrieval_top_score,
      event.grounded_score,
      event.grounded_commit,
    ],
    indexes: [event.conversation_id],
  });
}

export function writeFeedbackEvent(
  ae: AnalyticsEngineDataset,
  page_url: string,
  rating: "up" | "down",
  conversation_id: string,
): void {
  ae.writeDataPoint({
    blobs: [page_url, "", "", `feedback_${rating}`, ""],
    doubles: [0, 0, 0, 0, 0],
    indexes: [conversation_id],
  });
}

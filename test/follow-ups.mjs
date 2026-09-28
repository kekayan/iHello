/** Mirrors src/pipeline.ts normalizeFollowUps for a quick local check. */
function normalizeFollowUps(raw, fallback = []) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === "object" && Array.isArray(raw.suggestions)) {
    list = raw.suggestions;
  }
  const cleaned = list
    .filter((s) => typeof s === "string")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .map((s) => (s.length > 80 ? s.slice(0, 77).trimEnd() + "…" : s))
    .filter((s) => s.length > 0);
  const uniq = [];
  for (const s of cleaned) {
    if (!uniq.some((u) => u.toLowerCase() === s.toLowerCase())) uniq.push(s);
  }
  const picked = uniq.slice(0, 3);
  if (picked.length >= 2) return picked;
  const fb = fallback
    .filter((s) => typeof s === "string")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0 && s.length <= 80)
    .slice(0, 3);
  return fb.length >= 2 ? fb.slice(0, 3) : picked.length ? picked : [];
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const fallback = [
  "AI adoption & agentic systems",
  "Cloud migration & modernisation",
  "Data & platform engineering",
];

{
  const got = normalizeFollowUps({
    suggestions: [
      "How long does a cloud migration take?",
      "What does a delivery pod include?",
      "Can we start with a discovery workshop?",
      "Extra fourth item ignored",
    ],
  });
  assert(got.length === 3, `expected 3 got ${got.length}`);
  assert(got.every((s) => s.length <= 80), "len");
  console.log("ok parse object:", got);
}

{
  const long = "x".repeat(100) + "?";
  const got = normalizeFollowUps([
    long,
    "What is your AI offering?",
    "Tell me about pods?",
  ]);
  assert(got.length === 3, "long+2");
  assert(got[0].length <= 80, "truncate");
  console.log("ok truncate len", got[0].length);
}

{
  const got = normalizeFollowUps({ suggestions: ["only one"] }, fallback);
  assert(got.length === 3, `fallback expected 3 got ${JSON.stringify(got)}`);
  console.log("ok fallback:", got);
}

{
  const got = normalizeFollowUps(null, []);
  assert(got.length === 0, "empty");
  console.log("ok empty");
}

console.log("all normalizeFollowUps checks passed");

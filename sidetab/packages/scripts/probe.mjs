// Connectivity probe for the 3 external services. No secret values printed.
// Run: node --env-file=sidetab/.env sidetab/packages/scripts/probe.mjs
const env = process.env;
const out = [];

async function probe(name, fn) {
  try {
    const r = await fn();
    out.push(`[PASS] ${name}: ${r}`);
  } catch (e) {
    out.push(`[FAIL] ${name}: ${String(e && e.message ? e.message : e).slice(0, 220)}`);
  }
}

await probe("deepseek", async () => {
  for (const model of ["deepseek-v4-flash", "deepseek-chat"]) {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "reply with the single word OK" }], max_tokens: 5, stream: false }),
    });
    if (r.ok) {
      const j = await r.json();
      return `model_ok=${model} resp=${JSON.stringify(j.choices?.[0]?.message?.content)}`;
    }
    if (model === "deepseek-chat") throw new Error(`both models failed: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  }
});

await probe("tavily", async () => {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query: "what is PID control", search_depth: "basic", max_results: 2, include_raw_content: false }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  return `results=${j.results?.length} first_title=${JSON.stringify(j.results?.[0]?.title?.slice(0, 50))}`;
});

await probe("upstash", async () => {
  // REST PING; then SET/GET roundtrip with TTL
  const base = env.UPSTASH_REDIS_REST_URL;
  const auth = { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` };
  const ping = await fetch(`${base}/ping`, { headers: auth });
  if (!ping.ok) throw new Error(`PING HTTP ${ping.status} ${(await ping.text()).slice(0, 160)}`);
  const setr = await fetch(`${base}/set/sidetab:probe/ok?EX=60`, { headers: auth });
  const getr = await fetch(`${base}/get/sidetab:probe`, { headers: auth });
  const g = await getr.json();
  return `ping=${JSON.stringify((await ping.json()).result)} set=${setr.ok} get=${JSON.stringify(g.result)}`;
});

console.log(out.join("\n"));

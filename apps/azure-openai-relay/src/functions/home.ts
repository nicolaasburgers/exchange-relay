import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { corsHeaders } from "../common/cors";

function renderHomeHtml(): string {
  const version = process.env.RELAY_VERSION || "1";
  const providerId = "azure_openai";
  const resourceName = "Azure OpenAI";

  const hasEndpoint = !!process.env.AOAI_ENDPOINT;
  const hasApiKey   = !!process.env.AOAI_API_KEY;
  const apiVersion  = process.env.AOAI_API_VERSION || "(unset)";

  let modelCount = 0;
  try {
    const raw = process.env.MODEL_MAP || "{}";
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") modelCount = Object.keys(obj).length;
  } catch { /* ignore */ }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Exchange Relay · ${providerId}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; margin: 2rem; line-height: 1.5; }
  .card { border: 1px solid #9993; border-radius: 12px; padding: 1rem 1.25rem; max-width: 860px; box-shadow: 0 1px 8px #0001; }
  h1 { margin: 0 0 .25rem 0; font-size: 1.4rem; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
  pre { background: #0000000d; padding: .75rem; border-radius: 8px; overflow-x: auto; }
  .grid { display: grid; gap: .5rem 1rem; grid-template-columns: 11rem 1fr; }
  a { text-decoration: none; }
</style>
</head>
<body>
  <div class="card">
    <h1>Exchange Relay</h1>
    <div>Resource: <strong>${resourceName}</strong> · Version: <strong>${version}</strong></div>
    <p>This relay exposes minimal endpoints for Kea. Try the links below.</p>

    <h2>Useful links</h2>
    <ul>
      <li><a href="/kea/v1/provider">/kea/v1/provider</a> – provider info</li>
      <li><a href="/kea/v1/manifest">/kea/v1/manifest</a> – deployments (displayName → deploymentName)</li>
      <li><code>POST /kea/v1/chat</code> – chat completions (see curl example)</li>
    </ul>

    <h2>Status (no secrets shown)</h2>
    <div class="grid">
      <div>Endpoint set:</div><div>${hasEndpoint ? "yes" : "no"}</div>
      <div>API version:</div><div>${apiVersion}</div>
      <div>API key set:</div><div>${hasApiKey ? "yes" : "no"}</div>
      <div>MODEL_MAP entries:</div><div>${modelCount}</div>
    </div>

    <h2>curl example</h2>
    <pre>curl -s -X POST http(s)://&lt;host&gt;/kea/v1/chat \
  -H "Content-Type: application/json" \
  -d '{ "model":"&lt;deploymentName&gt;", "max_tokens":128,
        "messages":[{"role":"user","content":"Hello from Kea"}] }'</pre>
  </div>
</body>
</html>`;
}

async function homeHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const origin = req.headers.get("origin") || undefined;
  const headers = { 
    ...corsHeaders(origin), 
    "Content-Type": "text/html; charset=utf-8", 
    "Cache-Control": "no-store"
  };
  if (req.method === "OPTIONS") return { status: 204, headers };
  return { status: 200, body: renderHomeHtml(), headers };
}

// Root "/"
app.http("home_root", {
  route: "{ignored:maxlength(0)?}",  // matches ONLY "/"
  methods: ["GET", "HEAD", "OPTIONS"],
  authLevel: "anonymous",
  handler: homeHandler
});

// "/kea"
app.http("home_kea", {
  route: "kea",
  methods: ["GET", "HEAD", "OPTIONS"],
  authLevel: "anonymous",
  handler: homeHandler
});

// "/kea/v1"
app.http("home_kea_v1", {
  route: "kea/v1",
  methods: ["GET", "HEAD", "OPTIONS"],
  authLevel: "anonymous",
  handler: homeHandler
});

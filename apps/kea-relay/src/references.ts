import { RelayConfig, RelayModelConfig } from "./dtos";

export function homeHtml(config: RelayConfig, modelConfig: RelayModelConfig): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${config.relayName}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 24px; line-height: 1.5; }
    .card { border: 1px solid #d0d7de; border-radius: 12px; padding: 18px; max-width: 900px; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre { background: #f6f8fa; padding: 12px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${config.relayName}</h1>
    <p>Provider: <strong>${config.defaultProvider}</strong> | Version: <strong>${config.relayVersion}</strong></p>
    <p>This is the neutral containerized relay service. Bedrock is the first real adapter implementation.</p>
    <ul>
      <li><a href="/kea/v1/provider">/kea/v1/provider</a></li>
      <li><a href="/kea/v1/manifest">/kea/v1/manifest</a></li>
      <li><code>POST /kea/v1/chat</code></li>
      <li><a href="/health">/health</a></li>
    </ul>
    <p>Configured deployments: <strong>${modelConfig.deployments.length}</strong></p>
    <pre>curl -s -X POST http://localhost:${config.port}/kea/v1/chat \\
  -H "Content-Type: application/json" \\
  -d '{"model":"claude-sonnet-4-5","messages":[{"role":"user","content":"hello"}]}'</pre>
  </div>
</body>
</html>`;
}
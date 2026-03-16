# kea-relay (containerized, Bedrock-first)

This app is the new neutral relay service for Kea.

Implementation note:

- Runtime logic is intentionally consolidated in `src/index.ts` to keep code review simple.

Goals for v1:

- Keep Kea endpoint compatibility.
- Use a real provider adapter interface.
- Implement only AWS Bedrock as a real adapter.
- Keep the service portable as a single Docker image.
- Avoid provider secrets in Kea clients.

## Endpoints

- GET /
- GET /kea
- GET /kea/v1
- GET /health
- GET /kea/v1/provider
- GET /kea/v1/manifest
- POST /kea/v1/chat

## POST /kea/v1/chat

Minimum request:

```json
{
  "model": "claude-sonnet-4-5",
  "messages": [{ "role": "user", "content": "Hello" }],
  "max_tokens": 256
}
```

If `max_tokens` is omitted the relay applies `DEFAULT_MAX_TOKENS`.

Upstream note: `max_tokens` is forwarded to Bedrock Converse as `inferenceConfig.maxTokens`
(camelCase). This is Bedrock Converse's own field name for Claude and all other Converse-compatible models.

Response shape:

```json
{
  "model": "claude-sonnet-4-5",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "..." }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

## Configuration

Core:

- PORT=8080
- RELAY_VERSION=1
- RELAY_NAME=AWS Bedrock Relay
- DEFAULT_PROVIDER=aws_bedrock
- REQUEST_TIMEOUT_MS=60000
- DEFAULT_MAX_TOKENS=4096
- MODEL_MAP_FILE=/app/models.json
- MODEL_MAP={...} (alternative to MODEL_MAP_FILE)

Bedrock:

- AWS_REGION=eu-west-1

Optional:

- BEDROCK_ENABLE_STREAMING=false (planned; not implemented in v1)

## Model map formats

Supported format A (manifest-like):

{
  "providerId": "aws_bedrock",
  "name": "AWS Bedrock Relay",
  "version": "1",
  "deployments": [
    {
      "displayName": "Claude Sonnet 4.5 (Approved)",
      "deploymentName": "claude-sonnet-4-5",
      "provider": "aws_bedrock",
      "bedrockModelId": "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      "inferenceProfileArn": null,
      "maxTokens": 4096,
      "temperature": null,
      "topP": null,
      "stopSequences": []
    }
  ]
}

Supported format B (displayName -> deploymentName):

{
  "Claude Sonnet 4.5 (Approved)": "claude-sonnet-4-5"
}

## Run locally

1. Install dependencies.
2. Build.
3. Start service.

PowerShell example:

npm install
npm run build
$env:AWS_REGION="eu-west-1"
$env:MODEL_MAP_FILE="./models.json.example"
npm start

## Docker build and run

Build:

docker build -t kea-relay:dev .

Run (AWS EC2 with instance profile role):

docker run -d --name kea-relay --restart unless-stopped -p 8080:8080 -e AWS_REGION=eu-west-1 -e PORT=8080 -e MODEL_MAP_FILE=/app/models.json -v /opt/kea-relay/models.json:/app/models.json:ro kea-relay:dev

No AWS access key or secret key should be passed if runtime IAM identity is available.

## Azure deployment example (same image)

Use the same container image in Azure Container Apps internal environment, App Service for Containers, or a VM with Docker.

Keep ingress internal and mount/provide model config via file or environment.

## Notes on streaming

Streaming is intentionally not implemented in v1.

The provider boundary is kept adapter-based so streaming can be added later with minimal public contract changes.

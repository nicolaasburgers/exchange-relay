import express, { Request, Response } from "express";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { homeHtml } from "./references";
import { KeaChatResponse, ProviderAdapter, ProviderChatRequest, RelayConfig, RelayModelConfig } from "./dtos";
import { buildConversationMessages, buildSystem, extractAssistantText, findDeployment, loadConfig, loadRelayModelConfig, mapAdapterError, mapFinishReason, normalizeChatRequest } from "./utils";

class AwsBedrockAdapter implements ProviderAdapter {
  public readonly providerId = "aws_bedrock";
  private readonly client: BedrockRuntimeClient;
  private readonly timeoutMs: number;

  public constructor(config: RelayConfig) {
    this.client = new BedrockRuntimeClient({ region: config.awsRegion });
    this.timeoutMs = config.requestTimeoutMs;
  }

  public async invokeChat(request: ProviderChatRequest): Promise<KeaChatResponse> {
    const system = buildSystem(request.normalized.messages);
    const messages = buildConversationMessages(request.normalized.messages);

    const modelId = request.deployment.inferenceProfileArn || request.deployment.bedrockModelId || request.deployment.deploymentName;

    const maxTokens = request.normalized.maxTokens;
    const temperature = Number.isFinite(request.deployment.temperature) ? Number(request.deployment.temperature) : undefined;
    const topP = Number.isFinite(request.deployment.topP) ? Number(request.deployment.topP) : undefined;

    const command = new ConverseCommand({ modelId, system, messages,
      inferenceConfig: { maxTokens, temperature, topP, stopSequences: request.deployment.stopSequences || []}
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.client.send(command, { abortSignal: controller.signal });
      const content = extractAssistantText(response);

      return {
        model: request.normalized.modelAlias,
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: mapFinishReason(response.stopReason) }],
        usage: {
          prompt_tokens: response.usage?.inputTokens ?? 0,
          completion_tokens: response.usage?.outputTokens ?? 0,
          total_tokens: response.usage?.totalTokens ?? 0
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function buildProviderRegistry(config: RelayConfig): Record<string, ProviderAdapter> {
  const bedrock = new AwsBedrockAdapter(config);
  return { [bedrock.providerId]: bedrock };
}

function providerRoute(config: RelayConfig) {
  return (_req: Request, res: Response): void => {
    res.status(200).json({ providerId: config.defaultProvider, name: config.relayName, version: config.relayVersion });
  };
}

function manifestRoute(modelConfig: RelayModelConfig) {
  return (_req: Request, res: Response): void => {
    res.status(200).json({
      providerId: modelConfig.providerId,
      name: modelConfig.name,
      version: modelConfig.version,
      deployments: modelConfig.deployments.map((d) => ({
        displayName: d.displayName,
        deploymentName: d.deploymentName
      }))
    });
  };
}

function healthRoute() {
  return (_req: Request, res: Response): void => {
    res.status(200).json({ status: "ok" });
  };
}

function homeRoute(config: RelayConfig, modelConfig: RelayModelConfig) {
  return (_req: Request, res: Response): void => {
    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(homeHtml(config, modelConfig));
  };
}

function chatRoute(config: RelayConfig, modelConfig: RelayModelConfig, providers: Record<string, ProviderAdapter>) {
  return async (req: Request, res: Response): Promise<void> => {
    const normalized = normalizeChatRequest(req.body, config.defaultMaxTokens);
    if (!normalized) {
      res.status(400).send("Required: model, messages[]; optional: max_tokens or maxTokens");
      return;
    }

    const deployment = findDeployment(modelConfig, normalized.modelAlias);
    if (!deployment) {
      res.status(400).send(`Unknown model alias: ${normalized.modelAlias}`);
      return;
    }

    const provider = providers[deployment.provider];
    if (!provider) {
      res.status(400).send(`Unsupported provider for deployment: ${deployment.provider}`);
      return;
    }

    const maxForDeployment = Number.isFinite(deployment.maxTokens) ? Number(deployment.maxTokens) : normalized.maxTokens;
    const finalMaxTokens = Math.max(1, Math.min(normalized.maxTokens, maxForDeployment));

    try {
      const response = await provider.invokeChat({
        normalized: { ...normalized, maxTokens: finalMaxTokens },
        deployment
      });

      res.status(200).json(response);
    } catch (error) {
      const mapped = mapAdapterError(error);
      res.status(mapped.status).send(mapped.message);
    }
  };
}

const config = loadConfig();
const modelConfig = loadRelayModelConfig(config);
const providers = buildProviderRegistry(config);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const home = homeRoute(config, modelConfig);
app.get("/", home);
app.get("/kea", home);
app.get("/kea/v1", home);

app.get("/health", healthRoute());
app.get("/kea/v1/provider", providerRoute(config));
app.get("/kea/v1/manifest", manifestRoute(modelConfig));
app.post("/kea/v1/chat", chatRoute(config, modelConfig, providers));

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(config.port, () => {
  console.log(`kea-relay listening on port ${config.port}`);
  console.log(`provider=${config.defaultProvider} deployments=${modelConfig.deployments.length}`);
});

import { readFileSync } from "node:fs";
import { ConverseCommandOutput, Message, SystemContentBlock } from "@aws-sdk/client-bedrock-runtime";
import {
  DeploymentConfig,
  KeaChatRequest,
  NormalizedChatRequest,
  ProviderChatRequest,
  RelayConfig,
  RelayModelConfig
} from "./dtos";

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function parseBoolean(input: string | undefined, fallback: boolean): boolean {
  if (!input) {
    return fallback;
  }
  return input.toLowerCase() === "true";
}

export function loadConfig(): RelayConfig {
  return {
    port: parsePositiveInt(process.env.PORT, 8080),
    relayVersion: process.env.RELAY_VERSION || "1",
    relayName: process.env.RELAY_NAME || "AWS Bedrock Relay",
    defaultProvider: (process.env.DEFAULT_PROVIDER || "aws_bedrock").trim(),
    requestTimeoutMs: parsePositiveInt(process.env.REQUEST_TIMEOUT_MS, 60000),
    modelMapFile: process.env.MODEL_MAP_FILE,
    modelMapRaw: process.env.MODEL_MAP,
    defaultMaxTokens: parsePositiveInt(process.env.DEFAULT_MAX_TOKENS, 4096),
    allowUserMetadata: parseBoolean(process.env.ALLOW_USER_METADATA, false),
    logLevel: process.env.LOG_LEVEL || "info",
    awsRegion: process.env.AWS_REGION,
    bedrockEnableStreaming: parseBoolean(process.env.BEDROCK_ENABLE_STREAMING, false)
  };
}

function sanitizeDeployment(input: DeploymentConfig, defaultProvider: string): DeploymentConfig {
  const deploymentName = (input.deploymentName || "").trim();
  if (!deploymentName) {
    throw new Error("Each deployment needs a non-empty deploymentName");
  }

  return {
    displayName: (input.displayName || deploymentName).trim(),
    deploymentName,
    provider: (input.provider || defaultProvider).trim(),
    bedrockModelId: input.bedrockModelId?.trim(),
    inferenceProfileArn: input.inferenceProfileArn || null,
    maxTokens: Number.isFinite(input.maxTokens) ? Number(input.maxTokens) : undefined,
    temperature: Number.isFinite(input.temperature) ? Number(input.temperature) : null,
    topP: Number.isFinite(input.topP) ? Number(input.topP) : null,
    stopSequences: Array.isArray(input.stopSequences) ? input.stopSequences.filter((s) => typeof s === "string") : []
  };
}

function parseDisplayToDeploymentMap(rawObject: Record<string, unknown>, defaultProvider: string): DeploymentConfig[] {
  const deployments: DeploymentConfig[] = [];
  for (const [displayName, value] of Object.entries(rawObject)) {
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    deployments.push(sanitizeDeployment({ displayName, deploymentName: value.trim(), provider: defaultProvider, bedrockModelId: value.trim() }, defaultProvider));
  }
  return deployments;
}

function parseManifestLike(rawObject: Record<string, unknown>, defaultProvider: string): RelayModelConfig {
  const rawDeployments = rawObject.deployments;
  if (!Array.isArray(rawDeployments)) {
    throw new Error("Manifest-like model map requires a deployments array");
  }

  const deployments = rawDeployments
    .filter((item): item is DeploymentConfig => typeof item === "object" && item !== null)
    .map((item) => sanitizeDeployment(item, defaultProvider));

  return {
    providerId: typeof rawObject.providerId === "string" ? rawObject.providerId : defaultProvider,
    name: typeof rawObject.name === "string" ? rawObject.name : "AWS Bedrock Relay",
    version: typeof rawObject.version === "string" ? rawObject.version : "1",
    deployments
  };
}

function loadRawModelConfig(config: RelayConfig): unknown {
  if (config.modelMapFile) {
    const content = readFileSync(config.modelMapFile, "utf-8");
    return JSON.parse(content);
  }

  if (config.modelMapRaw) {
    return JSON.parse(config.modelMapRaw);
  }

  throw new Error("Set MODEL_MAP_FILE or MODEL_MAP to configure deployments");
}

export function loadRelayModelConfig(config: RelayConfig): RelayModelConfig {
  const parsed = loadRawModelConfig(config);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Model configuration must be a JSON object");
  }

  const rawObject = parsed as Record<string, unknown>;
  if (Array.isArray(rawObject.deployments)) {
    return parseManifestLike(rawObject, config.defaultProvider);
  }

  const deployments = parseDisplayToDeploymentMap(rawObject, config.defaultProvider);
  if (deployments.length === 0) {
    throw new Error("No valid deployments found in model configuration");
  }

  return {
    providerId: config.defaultProvider,
    name: config.relayName,
    version: config.relayVersion,
    deployments
  };
}

export function findDeployment(modelConfig: RelayModelConfig, alias: string): DeploymentConfig | undefined {
  return modelConfig.deployments.find((d) => d.deploymentName === alias);
}

export function buildSystem(messages: ProviderChatRequest["normalized"]["messages"]): SystemContentBlock[] {
  return messages.filter((m) => m.role === "system" && m.content.trim().length > 0).map((m) => ({ text: m.content }));
}

export function buildConversationMessages(messages: ProviderChatRequest["normalized"]["messages"]): Message[] {
  const conversation: Message[] = [];

  for (const message of messages) {
    if (message.role === "system" || message.content.trim().length === 0) {
      continue;
    }

    const role: "user" | "assistant" = message.role;
    conversation.push({ role, content: [{ text: message.content }] });
  }

  return conversation;
}

export function extractAssistantText(response: ConverseCommandOutput): string {
  const content = response.output?.message?.content || [];
  const textParts: string[] = [];

  for (const block of content) {
    if (typeof block.text === "string") {
      textParts.push(block.text);
    }
  }

  return textParts.join("\n");
}

export function mapFinishReason(stopReason: string | undefined): "stop" | "length" {
  return stopReason === "max_tokens" ? "length" : "stop";
}

export function normalizeChatRequest(body: unknown, defaultMaxTokens: number): NormalizedChatRequest | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const parsed = body as KeaChatRequest;
  if (typeof parsed.model !== "string" || !parsed.model.trim()) {
    return null;
  }

  if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
    return null;
  }

  for (const message of parsed.messages) {
    const roleValid = message?.role === "system" || message?.role === "user" || message?.role === "assistant";
    const contentValid = typeof message?.content === "string";
    if (!roleValid || !contentValid) {
      return null;
    }
  }

  const requestedMax = parsed.max_tokens ?? parsed.maxTokens;
  const resolved = Number.isFinite(requestedMax) ? Number(requestedMax) : defaultMaxTokens;
  const maxTokens = Math.max(1, Math.floor(resolved));

  return {
    modelAlias: parsed.model.trim(),
    messages: parsed.messages,
    maxTokens
  };
}

export function mapAdapterError(error: unknown): { status: number; message: string } {
  const err = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  if (err?.name === "AbortError") {
    return { status: 504, message: "Upstream timeout" };
  }

  if (err?.name === "ThrottlingException") {
    return { status: 429, message: err.message || "Bedrock throttled request" };
  }

  if (err?.name === "ValidationException") {
    return { status: 400, message: err.message || "Upstream validation failed" };
  }

  const status = err?.$metadata?.httpStatusCode;
  if (typeof status === "number" && status >= 400 && status < 600) {
    return { status, message: err.message || "Upstream error" };
  }

  return { status: 502, message: err?.message || "Upstream provider error" };
}
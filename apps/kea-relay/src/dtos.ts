export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type KeaChatRequest = {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  maxTokens?: number;
};

export type NormalizedChatRequest = {
  modelAlias: string;
  messages: ChatMessage[];
  maxTokens: number;
};

export type KeaChatResponse = {
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop" | "length";
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type DeploymentConfig = {
  displayName: string;
  deploymentName: string;
  provider: string;
  bedrockModelId?: string;
  inferenceProfileArn?: string | null;
  maxTokens?: number;
  temperature?: number | null;
  topP?: number | null;
  stopSequences?: string[];
};

export type RelayModelConfig = {
  providerId: string;
  name: string;
  version: string;
  deployments: DeploymentConfig[];
};

export type ProviderChatRequest = {
  normalized: NormalizedChatRequest;
  deployment: DeploymentConfig;
};

export type ProviderAdapter = {
  readonly providerId: string;
  invokeChat(request: ProviderChatRequest): Promise<KeaChatResponse>;
};

export type RelayConfig = {
  port: number;
  relayVersion: string;
  relayName: string;
  defaultProvider: string;
  requestTimeoutMs: number;
  modelMapFile?: string;
  modelMapRaw?: string;
  defaultMaxTokens: number;
  allowUserMetadata: boolean;
  logLevel: string;
  awsRegion?: string;
  bedrockEnableStreaming: boolean;
};
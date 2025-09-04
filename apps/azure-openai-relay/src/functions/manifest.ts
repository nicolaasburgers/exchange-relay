import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { corsHeaders } from "../common/cors";

type ManifestDeployment = { displayName: string; deploymentName: string };
type ManifestResponse = {
  providerId: "azure_openai";
  name: string;
  version: string;
  deployments: ManifestDeployment[];
};

function parseModelMap(raw: string | undefined): ManifestDeployment[] {
  if (!raw) throw new Error("MODEL_MAP is not set");
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("MODEL_MAP must be valid JSON (e.g., { \"Display\": \"deploymentName\" })");
  }
  if (!obj || Array.isArray(obj) || typeof obj !== "object") {
    throw new Error("MODEL_MAP must be a JSON object mapping displayName → deploymentName");
  }

  const deployments: ManifestDeployment[] = [];
  for (const [displayName, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`MODEL_MAP value for "${displayName}" must be a non-empty string`);
    }
    deployments.push({ displayName, deploymentName: value });
  }

  // Optional: keep the output stable
  deployments.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return deployments;
}

app.http("manifest", {
  route: "kea/v1/manifest",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const headers = corsHeaders(req.headers.get("origin") || undefined);
    if (req.method === "OPTIONS") return { status: 204, headers };

    try {
      const deployments = parseModelMap(process.env.MODEL_MAP);
      const body: ManifestResponse = {
        providerId: "azure_openai",
        name: "Exchange Relay",
        version: process.env.RELAY_VERSION || "0.1.0",
        deployments
      };
      return { status: 200, jsonBody: body, headers: { ...headers, "Cache-Control": "public, max-age=300" } };
    } catch (err: any) {
      return {
        status: 500,
        body: `Server misconfiguration: ${err?.message || "invalid MODEL_MAP"}`,
        headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" }
      };
    }
  }
});

import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { corsHeaders } from "../common/cors";

type ManifestDeployment = {
  displayName: string;
  deploymentName: string;
};

type ManifestResponse = {
  providerId: "azure_openai";
  name: string;
  version: string;
  deployments: ManifestDeployment[];
};

app.http("manifest", {
  route: "manifest",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const headers = corsHeaders(req.headers.get("origin") || undefined);
    if (req.method === "OPTIONS") return { status: 204, headers };

    const body: ManifestResponse = {
      providerId: "azure_openai",
      name: "Exchange Relay",
      version: "1",
      deployments: [
        { displayName: "gpt-4.1", deploymentName: "my-gpt-4.1" },
        { displayName: "gpt-4o", deploymentName: "my-gpt-4o" }
      ]
    };

    return { status: 200, jsonBody: body, headers };
  }
});

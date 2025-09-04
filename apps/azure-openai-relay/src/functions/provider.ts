import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders } from "../common/cors";

const PROVIDER_ID = "azure_openai"; // constant per app
const PROVIDER_NAME = "Azure OpenAI Relay";
const PROVIDER_VERSION = "1";   // bump with releases

app.http("provider", {
  route: "v1/provider",
  methods: ["GET","OPTIONS"],
  authLevel: "anonymous",
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const origin = req.headers.get("origin") || undefined;
    const headers = corsHeaders(origin);
    if (req.method === "OPTIONS") return { status: 204, headers };
    return {
      status: 200,
      jsonBody: {
        providerId: PROVIDER_ID,
        name: PROVIDER_NAME,
        version: PROVIDER_VERSION
      },
      headers
    };
  }
});

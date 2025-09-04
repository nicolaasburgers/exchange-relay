import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { corsHeaders } from "../common/cors";
import { randomUUID } from "node:crypto";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type ChatRequest = {
  model: string;           // deployment name from manifest.deployments[].deploymentName
  messages: ChatMessage[];
  max_tokens: number;      // required for this minimal relay
};

type ChatResponse = {
  requestId: string;
  model: string;
  choices: Array<{ index: number; message: { role: "assistant"; content: string }; finish_reason: "stop" | "length" }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

const AOAI_ENDPOINT     = (process.env.AOAI_ENDPOINT || "").trim().replace(/\/+$/, "");
const AOAI_API_VERSION  = (process.env.AOAI_API_VERSION || "").trim();  // e.g. "2024-06-01"
const AOAI_API_KEY      = (process.env.AOAI_API_KEY || "").trim();
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 60000); // optional but sensible

app.http("chat", {
  route: "v1/chat",
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const baseHeaders = corsHeaders(req.headers.get("origin") || undefined);
    if (req.method === "OPTIONS") return { status: 204, headers: baseHeaders };

    // Basic env checks
    if (!AOAI_ENDPOINT || !AOAI_API_VERSION || !AOAI_API_KEY) {
      return {
        status: 500,
        body: "Server misconfiguration: AOAI_ENDPOINT, AOAI_API_VERSION, and AOAI_API_KEY must be set.",
        headers: baseHeaders
      };
    }

    // Parse request
    let body: ChatRequest;
    try { body = await req.json() as ChatRequest; }
    catch { return { status: 400, body: "Invalid JSON", headers: baseHeaders }; }

    if (!body?.model || !Array.isArray(body?.messages) || body.messages.length === 0 || !Number.isFinite(body?.max_tokens)) {
      return { status: 400, body: "Required fields: model (deployment name), messages[], max_tokens", headers: baseHeaders };
    }

    // Build AOAI request – deployment is in the URL; do not include "model" field
    const url = `${AOAI_ENDPOINT}/openai/deployments/${encodeURIComponent(body.model)}/chat/completions?api-version=${encodeURIComponent(AOAI_API_VERSION)}`;
    const payload = {
      messages: body.messages,
      max_tokens: body.max_tokens
      // Keep it minimal: omit temperature/top_p/etc. for now
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": AOAI_API_KEY
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const text = await res.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* best effort */ }

      if (!res.ok) {
        const msg = json?.error?.message || text || `HTTP ${res.status}`;
        return {
          status: res.status,
          body: msg,
          headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" }
        };
      }

      const requestId = randomUUID();
      const content: string = json?.choices?.[0]?.message?.content ?? "";
      const finishReason: "stop" | "length" = (json?.choices?.[0]?.finish_reason === "length") ? "length" : "stop";

      const resp: ChatResponse = {
        requestId,
        model: body.model,
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason }],
        usage: {
          prompt_tokens: json?.usage?.prompt_tokens ?? 0,
          completion_tokens: json?.usage?.completion_tokens ?? 0,
          total_tokens: json?.usage?.total_tokens ?? 0
        }
      };

      return { status: 200, jsonBody: resp, headers: { ...baseHeaders, "X-Request-Id": requestId } };

    } catch (err: any) {
      const status = err?.name === "AbortError" ? 504 : 502;
      const msg = err?.message || "Upstream error";
      return {
        status,
        body: msg,
        headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" }
      };
    } finally {
      clearTimeout(timer);
    }
  }
});

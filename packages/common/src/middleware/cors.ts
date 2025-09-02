export const corsHeaders = (origin?: string) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Relay-Signature, X-Client-Version",
  "Access-Control-Max-Age": "3600"
});
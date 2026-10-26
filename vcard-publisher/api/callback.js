import { handleCallback } from "../lib/auth.js";

export function GET(request) {
  return handleCallback(request, process.env);
}

import { handleLogin } from "../lib/auth.js";

export function GET(request) {
  return handleLogin(request, process.env);
}

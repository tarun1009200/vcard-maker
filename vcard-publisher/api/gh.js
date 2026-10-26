import { handleProxy } from "../lib/proxy.js";

// vercel.json rewrites /api/gh/<github path> here.
const handle = (request) => handleProxy(request, process.env);
export { handle as GET, handle as POST, handle as PATCH, handle as OPTIONS };

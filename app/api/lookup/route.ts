import Anthropic from "@anthropic-ai/sdk";
import { MemoryLibrary, type Library } from "../../../src/library";
import { EXAMPLES } from "../../../src/examples";
import { LookupRequest, lookupStream } from "../../../src/web/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A new lookup takes 1 to 3 minutes.
export const maxDuration = 300;

// Kept while the server instance is warm, so repeat links skip straight to a price refresh.
const g = globalThis as unknown as { library?: Library };
const library = (g.library ??= new MemoryLibrary(EXAMPLES));

export async function POST(req: Request) {
  const parsed = LookupRequest.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const required = process.env.SITE_ACCESS_CODE;
  if (required && parsed.data.code !== required) {
    return Response.json({ error: "Enter the access code to run new lookups." }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "The site's API key isn't set up yet. Add ANTHROPIC_API_KEY in Vercel's environment variables." }, { status: 500 });
  }

  const stream = lookupStream(parsed.data.url, { client: new Anthropic(), library });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

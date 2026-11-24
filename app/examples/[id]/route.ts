import { exampleById } from "../../../src/examples";
import { renderProfile } from "../../../src/render";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const record = exampleById(id);
  if (!record) return new Response("Not found", { status: 404 });
  return new Response(renderProfile(record), { headers: { "content-type": "text/html; charset=utf-8" } });
}

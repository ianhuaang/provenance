import Anthropic from "@anthropic-ai/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { lookup, refresh } from "./engine/lookup.js";
import { FileLibrary } from "./library.js";
import { renderProfile } from "./render.js";
import { ProfileRecord } from "./schema.js";

const LIBRARY_DIR = resolve(process.env.LIBRARY_DIR ?? "library");
const OUT_DIR = resolve(process.env.OUT_DIR ?? "out");

const usage = `Usage:
  npm run lookup -- <product-url>        Profile a product (or refresh it if already in the library)
  npm run refresh -- <record-id>         Re-check prices for a saved profile
  npm run render -- <record.json> [out.html]   Render a profile record to HTML`;

async function writePage(record: ProfileRecord, out?: string) {
  const file = out ?? join(OUT_DIR, `${record.id}.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, renderProfile(record));
  return file;
}

function client() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY first (see README). Live lookups call the Claude API.");
    process.exit(1);
  }
  return new Anthropic();
}

const progress = (m: string) => console.error(`  ${m}`);

async function main() {
  const [cmd, arg, arg2] = process.argv.slice(2);
  if (!cmd || !arg) {
    console.error(usage);
    process.exit(1);
  }
  const library = new FileLibrary(LIBRARY_DIR);

  if (cmd === "render") {
    const record = ProfileRecord.parse(JSON.parse(await readFile(arg, "utf8")));
    console.log(await writePage(record, arg2));
    return;
  }

  if (cmd === "lookup" || cmd === "refresh") {
    const started = Date.now();
    let result;
    if (cmd === "lookup") result = await lookup(arg, { client: client(), library, onProgress: progress });
    else {
      const record = await library.get(arg);
      if (!record) throw new Error(`No saved profile with id ${arg} in ${LIBRARY_DIR}`);
      result = await refresh(record, { client: client(), library, onProgress: progress });
    }
    const file = await writePage(result.record);
    const t = result.total;
    console.error(
      `\n${result.record.identity.canonicalName} (${result.record.classification.verdict})` +
        `\n${result.fromLibrary ? "From library, prices refreshed" : "New profile"} in ${((Date.now() - started) / 1000).toFixed(0)}s` +
        `\nCost: $${t.usd.toFixed(3)} · ${t.webSearches} searches · ${t.webFetches} fetches · ${t.inputTokens.toLocaleString()} in / ${t.outputTokens.toLocaleString()} out tokens`,
    );
    for (const c of result.costs) console.error(`  ${c.step.padEnd(13)} ${c.model.padEnd(18)} $${c.usd.toFixed(3)}`);
    console.log(file);
    return;
  }

  console.error(usage);
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

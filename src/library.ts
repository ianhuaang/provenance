import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ProfileRecord } from "./schema.js";

/**
 * The shared profile library. Phase 1 stores one JSON file per product in a folder;
 * phase 2 swaps this for a Postgres table behind the same interface.
 */
export interface Library {
  get(id: string): Promise<ProfileRecord | null>;
  findByModel(maker: string, modelNumber: string): Promise<ProfileRecord | null>;
  findByUrl(url: string): Promise<ProfileRecord | null>;
  save(record: ProfileRecord): Promise<void>;
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export function recordId(maker: string, modelNumber: string | null, canonicalName: string): string {
  const makerWord = slug(maker).split("-")[0] ?? "item";
  return modelNumber ? `${makerWord}-${slug(modelNumber)}` : slug(canonicalName);
}

const sameUrl = (a: string, b: string) => {
  const norm = (u: string) => {
    try {
      const x = new URL(u);
      return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, "")).toLowerCase();
    } catch {
      return u.toLowerCase();
    }
  };
  return norm(a) === norm(b);
};

export class FileLibrary implements Library {
  constructor(private dir: string) {}

  private async all(): Promise<ProfileRecord[]> {
    await mkdir(this.dir, { recursive: true });
    const files = (await readdir(this.dir)).filter((f) => f.endsWith(".json"));
    const out: ProfileRecord[] = [];
    for (const f of files) {
      const parsed = ProfileRecord.safeParse(JSON.parse(await readFile(join(this.dir, f), "utf8")));
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }

  async get(id: string) {
    return (await this.all()).find((r) => r.id === id) ?? null;
  }

  async findByModel(maker: string, modelNumber: string) {
    const m = slug(modelNumber);
    const mk = slug(maker).split("-")[0];
    return (
      (await this.all()).find(
        (r) =>
          (r.identity.modelNumber && slug(r.identity.modelNumber) === m && slug(r.identity.maker).startsWith(mk ?? "")) ||
          r.identity.otherModelNumbers.some((o) => slug(o.model) === m),
      ) ?? null
    );
  }

  async findByUrl(url: string) {
    return (await this.all()).find((r) => sameUrl(r.input.resolvedUrl, url) || r.retailers.some((l) => !l.isSearchLink && sameUrl(l.url, url))) ?? null;
  }

  async save(record: ProfileRecord) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${record.id}.json`), JSON.stringify(ProfileRecord.parse(record), null, 2) + "\n");
  }
}

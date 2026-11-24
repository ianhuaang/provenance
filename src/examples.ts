import { ProfileRecord } from "./schema";
import levi from "../fixtures/levi.json";
import otto from "../fixtures/otto.json";
import pop from "../fixtures/pop.json";
import keira from "../fixtures/keira.json";
import wren from "../fixtures/wren.json";
import zara from "../fixtures/zara-semisphere.json";
import emma from "../fixtures/westelm-emma.json";
import luna from "../fixtures/luna.json";
import nomi from "../fixtures/uo-nomi.json";
import scallop from "../fixtures/uo-scallop.json";
import zaraCordless from "../fixtures/zara-cordless.json";

/** Hand-checked profiles shown on the home page and used to seed the library. */
export const EXAMPLES: ProfileRecord[] = [luna, nomi, scallop, zaraCordless, wren, zara, emma, otto, keira, pop, levi].map((r) => ProfileRecord.parse(r));

export const exampleById = (id: string) => EXAMPLES.find((r) => r.id === id) ?? null;

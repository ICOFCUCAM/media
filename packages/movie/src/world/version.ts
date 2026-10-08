import { createHash } from "node:crypto";
import type { FilmPackage } from "../ir/schema";

/** Content version of a package's canon (stable for equal packages). */
export function canonVersion(pkg: FilmPackage): string {
  return createHash("sha256").update(JSON.stringify(pkg)).digest("hex").slice(0, 16);
}

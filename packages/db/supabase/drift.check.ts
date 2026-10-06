/*
 * Compile-time guard: the web app's hand-kept Supabase types
 * (apps/web/lib/database.types.ts) must not claim tables or columns the live
 * schema (./types.ts, regenerated from the project) doesn't have, nor hide a
 * nullable column as non-null. A failure here names the table and column.
 * Run by `pnpm --filter @cineforge/db typecheck`.
 */
import type { Database as Web } from "../../../apps/web/lib/database.types";
import type { Database as Live } from "./types";

type WT = Web["public"]["Tables"];
type LT = Live["public"]["Tables"];

type Drift = {
  [T in keyof WT & keyof LT]: {
    missing: Exclude<keyof WT[T]["Row"], keyof LT[T]["Row"]>;
    nullHidden: {
      [K in keyof WT[T]["Row"] & keyof LT[T]["Row"]]: null extends LT[T]["Row"][K] ? (null extends WT[T]["Row"][K] ? never : K) : never;
    }[keyof WT[T]["Row"] & keyof LT[T]["Row"]];
    insertMissing: Exclude<keyof WT[T]["Insert"], keyof LT[T]["Insert"]>;
  };
};
type Bad = { [T in keyof Drift]: Drift[T]["missing"] | Drift[T]["nullHidden"] | Drift[T]["insertMissing"] extends never ? never : T }[keyof Drift];

declare const report: { tables: Exclude<keyof WT, keyof LT>; bad: Bad; detail: { [T in Bad]: Drift[T] } };
export const noDrift: { tables: never; bad: never } = report;

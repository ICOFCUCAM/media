/**
 * Model-facing JSON Schemas within the providers' structured-output limits.
 *
 * Anthropic refuses an output schema with more than 16 union-typed
 * parameters (`anyOf` or a `type` array). The Film IR has more: every
 * optional field is "string or null", and some ids accept several id shapes.
 * The model does not need unions to answer them, so the schema SENT to a
 * provider is flattened, and the answer is turned back before anyone reads
 * it — CineForge's own zod schemas and validators are unchanged:
 *
 *   string | null      →  string ("" means none; a pattern also accepts "")
 *   enum | null        →  enum with "" added ("" means none)
 *   integer>=0 | null  →  integer with -1 allowed (-1 means none)
 *   string A | string B (id shapes, "audience")  →  one string, patterns joined
 *
 * Unions that cannot be flattened safely (nullable objects) are kept; the
 * film package keeps two, far under the limit (tested).
 */
type Node = Record<string, unknown>;

export const MAX_UNION_PARAMETERS = 16;

const isNull = (b: Node) => b.type === "null";
const nonNull = (n: Node): Node[] => {
  if (Array.isArray(n.anyOf)) return (n.anyOf as Node[]).filter((b) => !isNull(b));
  if (Array.isArray(n.type)) return (n.type as string[]).filter((t) => t !== "null").map((t) => ({ ...n, type: t }));
  return [n];
};
const nullable = (n: Node) => (Array.isArray(n.anyOf) && (n.anyOf as Node[]).some(isNull)) || (Array.isArray(n.type) && (n.type as string[]).includes("null"));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** How a nullable node is flattened, or null when it is kept as a union. */
function sentinelKind(n: Node): "string" | "integer" | null {
  if (!nullable(n)) return null;
  const rest = nonNull(n);
  if (rest.length !== 1) return null;
  const x = rest[0]!;
  if (x.type === "string") return "string";
  if (x.type === "integer" && typeof x.minimum === "number" && x.minimum >= 0) return "integer";
  return null;
}

/** A regex accepting exactly what a string branch accepts. */
function branchPattern(b: Node): string | null {
  if (b.type !== "string") return null;
  if (typeof b.const === "string") return `^${escape(b.const)}$`;
  if (Array.isArray(b.enum)) return `^(?:${(b.enum as string[]).map(escape).join("|")})$`;
  if (typeof b.pattern === "string") return b.pattern;
  return ".*";
}

function flatten(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(flatten);
  if (!node || typeof node !== "object") return node;
  const n = node as Node;
  const describe = (x: Node, add: string) => ({ ...x, description: [n.description ?? x.description, add].filter(Boolean).join(" ") });
  const kind = sentinelKind(n);
  if (kind) {
    const x = flatten(nonNull(n)[0]) as Node;
    if (kind === "integer") return describe({ ...x, minimum: -1 }, "Use -1 for none.");
    if (Array.isArray(x.enum)) return describe({ ...x, enum: [...(x.enum as string[]), ""] }, "Use an empty string for none.");
    const { minLength: _m, ...rest } = x;
    return describe(typeof rest.pattern === "string" ? { ...rest, pattern: `^$|(?:${rest.pattern})` } : rest, "Use an empty string for none.");
  }
  // A union of string shapes (ids of several kinds, "audience") is one string with the patterns joined.
  if (Array.isArray(n.anyOf) && !nullable(n)) {
    const pats = (n.anyOf as Node[]).map(branchPattern);
    if (pats.every((p): p is string => p !== null)) {
      const { anyOf: _a, ...rest } = n;
      return { ...rest, type: "string", pattern: pats.map((p) => `(?:${p})`).join("|") };
    }
  }
  const out: Node = {};
  for (const [k, v] of Object.entries(n)) out[k] = flatten(v);
  return out;
}

/** The schema to send a provider (pure; the input is not changed). */
export function modelSafeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return flatten(schema) as Record<string, unknown>;
}

/** Turn a provider's answer back: "" and -1 where the original allowed null become null (pure). */
export function restoreNulls(value: unknown, schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return value;
  const n = schema as Node;
  if (nullable(n)) {
    if (value === null || value === undefined) return null;
    const kind = sentinelKind(n);
    if (kind === "string" && value === "") return null;
    if (kind === "integer" && value === -1) return null;
    const rest = nonNull(n);
    return rest.length === 1 ? restoreNulls(value, rest[0]) : value;
  }
  if (Array.isArray(value) && n.items) return value.map((v) => restoreNulls(v, n.items));
  if (value && typeof value === "object" && !Array.isArray(value) && n.properties && typeof n.properties === "object") {
    const props = n.properties as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, k in props ? restoreNulls(v, props[k]) : v]));
  }
  return value;
}

/** Union-typed parameters in a schema, as the provider counts them. */
export function countUnionParameters(schema: unknown): number {
  let count = 0;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const n = node as Node;
    if (Array.isArray(n.anyOf) || Array.isArray(n.oneOf) || Array.isArray(n.type)) count++;
    Object.values(n).forEach(walk);
  };
  walk(schema);
  return count;
}

/**
 * Over-long text cut back to the schema's maxLength (at a word boundary when
 * one is near), so a description a few characters too long does not fail a
 * whole plan. Only strings change; arrays, numbers and ids are left for the
 * validator to judge (pure).
 */
export function clampStrings(value: unknown, schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return value;
  const n = schema as Node;
  if (Array.isArray(n.anyOf)) {
    const branch = (n.anyOf as Node[]).find((b) =>
      typeof value === "string" ? b.type === "string" : Array.isArray(value) ? b.type === "array" : value && typeof value === "object" ? b.type === "object" : false);
    return branch ? clampStrings(value, branch) : value;
  }
  if (typeof value === "string" && typeof n.maxLength === "number" && value.trim().length > n.maxLength) {
    const max = n.maxLength;
    const cut = value.trim().slice(0, max);
    const space = cut.lastIndexOf(" ");
    return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, "");
  }
  if (Array.isArray(value) && n.items) return value.map((v) => clampStrings(v, n.items));
  if (value && typeof value === "object" && !Array.isArray(value) && n.properties && typeof n.properties === "object") {
    const props = n.properties as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, k in props ? clampStrings(v, props[k]) : v]));
  }
  return value;
}

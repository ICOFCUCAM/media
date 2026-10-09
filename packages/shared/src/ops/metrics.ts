/**
 * Prometheus metrics (docs/38 §AF checklist 4: "JSON logs to stdout;
 * Prometheus /metrics"). A deliberately small registry — counters and gauges
 * with labels, rendered in the text exposition format — shared by the worker
 * and the API so both expose the same families. No client library needed.
 */

type Labels = Record<string, string | number>;

interface Family {
  name: string;
  help: string;
  type: "counter" | "gauge";
  values: Map<string, { labels: Labels; value: number }>;
}

const NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const keyOf = (labels: Labels) => JSON.stringify(Object.keys(labels).sort().map((k) => [k, String(labels[k])]));
const escape = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
const fmt = (labels: Labels) => {
  const ks = Object.keys(labels).sort();
  return ks.length ? `{${ks.map((k) => `${k}="${escape(String(labels[k]))}"`).join(",")}}` : "";
};

export class MetricsRegistry {
  private readonly families = new Map<string, Family>();

  private family(name: string, help: string, type: Family["type"]): Family {
    if (!NAME.test(name)) throw new Error(`invalid metric name ${name}`);
    let f = this.families.get(name);
    if (!f) {
      f = { name, help, type, values: new Map() };
      this.families.set(name, f);
    } else if (f.type !== type) {
      throw new Error(`metric ${name} is a ${f.type}, not a ${type}`);
    }
    return f;
  }

  /** Add to a counter (never negative). */
  inc(name: string, help: string, labels: Labels = {}, by = 1): void {
    if (by < 0 || !Number.isFinite(by)) throw new Error(`counter ${name} can only increase`);
    const f = this.family(name, help, "counter");
    const k = keyOf(labels);
    const cur = f.values.get(k);
    f.values.set(k, { labels, value: (cur?.value ?? 0) + by });
  }

  /** Set a gauge. */
  set(name: string, help: string, value: number, labels: Labels = {}): void {
    this.family(name, help, "gauge").values.set(keyOf(labels), { labels, value });
  }

  /** Text exposition format 0.0.4. */
  render(): string {
    const out: string[] = [];
    for (const f of [...this.families.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      out.push(`# HELP ${f.name} ${f.help.replace(/\n/g, " ")}`, `# TYPE ${f.name} ${f.type}`);
      for (const v of f.values.values()) out.push(`${f.name}${fmt(v.labels)} ${v.value}`);
    }
    return `${out.join("\n")}\n`;
  }

  reset(): void {
    this.families.clear();
  }
}

/** The process-wide registry. */
export const metrics = new MetricsRegistry();

export const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

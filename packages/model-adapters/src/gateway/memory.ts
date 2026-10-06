/** In-memory GatewayStore — used by tests and the end-to-end acceptance run. */
import type { GatewayEvent, GatewayStore, GrantRecord, RuntimeDeployment } from "./types";

export class MemoryGatewayStore implements GatewayStore {
  readonly deployments = new Map<string, RuntimeDeployment>();
  readonly grants = new Map<string, GrantRecord>();
  readonly events: GatewayEvent[] = [];

  async deploymentByUrl(baseUrl: string) {
    const norm = baseUrl.replace(/\/+$/, "");
    return [...this.deployments.values()].find((d) => d.baseUrl.replace(/\/+$/, "") === norm) ?? null;
  }
  async deploymentById(id: string) {
    return this.deployments.get(id) ?? null;
  }
  async saveDeployment(d: RuntimeDeployment) {
    this.deployments.set(d.id, { ...d });
  }
  async insertGrant(g: GrantRecord) {
    this.grants.set(g.id, { ...g });
  }
  async updateGrant(id: string, patch: Partial<GrantRecord>) {
    const g = this.grants.get(id);
    if (!g) throw new Error(`grant ${id} not found`);
    this.grants.set(id, { ...g, ...patch });
  }
  async insertEvent(e: GatewayEvent) {
    this.events.push(e);
  }
}

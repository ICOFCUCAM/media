export interface ShotNode {
  name: string;
  queueName: string;
  data: Record<string, unknown>;
  opts: Record<string, unknown>;
  children?: ShotNode[];
}

/**
 * A scene's shot jobs. Parallel by default. With SEQUENTIAL_SHOTS=1 they
 * form a chain — each shot waits for the one before it — so a shot can start
 * from the previous shot's last frame (end-state memory, W6) at the cost of
 * wall-clock time.
 */
export function shotNodes(shotIds: string[], make: (shotId: string) => ShotNode, sequential = process.env.SEQUENTIAL_SHOTS === "1"): ShotNode[] {
  if (!sequential || shotIds.length < 2) return shotIds.map(make);
  let chain: ShotNode | null = null;
  for (const id of shotIds) chain = { ...make(id), ...(chain ? { children: [chain] } : {}) };
  return [chain!];
}

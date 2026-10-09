/** The worker's meter: every paid call recorded in usage_records (./meter.ts). */
import { prisma } from "@cineforge/db";
import { recordUsage, type MeterDb, type UsageEvent } from "./meter";

export const meter = (e: UsageEvent) => recordUsage(prisma as unknown as MeterDb, e);
export { meteredEngine, meteredImages, type MeterContext, type UsageEvent } from "./meter";

import { Logger, OnModuleInit } from "@nestjs/common";
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { RealtimeSubscriber, projectRoom } from "@cineforge/realtime";
import { prisma } from "@cineforge/db";

/**
 * WebSocket gateway (docs/04). Authenticates the JWT on connect, lets a client
 * subscribe to its project room, and forwards events published by the workers
 * (via Redis pub/sub) into the matching Socket.IO room. Works across many API
 * nodes because every node subscribes to the same Redis channel.
 *
 * For multi-node Socket.IO presence, also attach the @socket.io/redis-adapter
 * in bootstrap (docs/01 WebSocket fan-out). Forwarding here is already
 * node-agnostic since the source of truth is the Redis channel.
 */
@WebSocketGateway({ path: "/v1/ws", cors: { origin: process.env.WEB_URL ?? true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit {
  private readonly log = new Logger(RealtimeGateway.name);
  private readonly sub = new RealtimeSubscriber(process.env.REDIS_URL ?? "redis://localhost:6379");

  @WebSocketServer() server!: Server;

  async onModuleInit() {
    await this.sub.start((env) => {
      this.server.to(env.room).emit(env.event, env.data);
    });
    this.log.log("realtime subscriber forwarding events to rooms");
  }

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.query?.token as string | undefined);
    try {
      const payload = jwt.verify(token ?? "", process.env.JWT_ACCESS_SECRET!) as { sub: string };
      client.data.userId = payload.sub;
    } catch {
      client.emit("error", { scope: "auth", message: "invalid token" });
      client.disconnect(true);
    }
  }

  @SubscribeMessage("subscribe")
  async onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { projectId: string },
  ) {
    const userId: string | undefined = client.data.userId;
    if (!userId || !body?.projectId) return { ok: false, error: "bad_request" };

    // Ownership check: only join the room if the project belongs to the caller
    // (docs/17). Prevents subscribing to another user's project events.
    const owned = await prisma.project.findFirst({
      where: { id: body.projectId, userId },
      select: { id: true },
    });
    if (!owned) {
      client.emit("error", { scope: "subscribe", message: "forbidden", projectId: body.projectId });
      return { ok: false, error: "forbidden" };
    }

    client.join(projectRoom(body.projectId));
    return { ok: true, room: projectRoom(body.projectId) };
  }

  @SubscribeMessage("unsubscribe")
  onUnsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { projectId: string }) {
    if (body?.projectId) client.leave(projectRoom(body.projectId));
    return { ok: true };
  }
}

import { CanActivate, ExecutionContext, Inject, Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { prisma } from "@cineforge/db";
import { TokenError, verifySupabaseToken } from "./supabase-token";

/** Where the guard reads a user's CineForge role (users.role); injectable for tests. */
export type RoleLookup = (userId: string) => Promise<string | null>;

export const ROLE_LOOKUP = "ROLE_LOOKUP";

export const dbRole: RoleLookup = async (userId) =>
  (await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role ?? null;

/**
 * Supabase session → `req.user` (docs/56 §2). The token proves who the caller
 * is; the database says what they are (USER / ADMIN). A valid token for a
 * user with no CineForge account is refused.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly role: RoleLookup;
  constructor(@Optional() @Inject(ROLE_LOOKUP) role?: RoleLookup) {
    this.role = role ?? dbRole;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Missing bearer token");
    let user;
    try {
      user = await verifySupabaseToken(header.slice(7));
    } catch (e) {
      if (e instanceof TokenError && /not configured/.test(e.message)) throw new ServiceUnavailableException(e.message);
      throw new UnauthorizedException("Invalid token");
    }
    const role = await this.role(user.userId);
    if (!role) throw new UnauthorizedException("No CineForge account for this user");
    req.user = { id: user.userId, role };
    return true;
  }
}

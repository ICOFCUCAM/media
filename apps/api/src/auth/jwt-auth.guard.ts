import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";

/**
 * Minimal JWT guard: verifies the access token and attaches `req.user`.
 * Replace with @nestjs/passport + a JwtStrategy in full implementation
 * (docs/17-security.md). RS256 + JWKS in production.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Missing bearer token");
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_ACCESS_SECRET!) as {
        sub: string;
        role?: string;
      };
      req.user = { id: payload.sub, role: payload.role ?? "USER" };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }
}

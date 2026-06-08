import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

/** Requires role=ADMIN (set by JwtAuthGuard). See docs/17-security.md. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (req.user?.role !== "ADMIN") throw new ForbiddenException("Admin only");
    return true;
  }
}

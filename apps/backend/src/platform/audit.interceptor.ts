import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor
} from "@nestjs/common";
import type { Request } from "express";
import { Observable, tap } from "rxjs";

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger("AuditTrail");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { headers: Record<string, string> }>();
    const started = Date.now();
    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          JSON.stringify({
            method: request.method,
            url: request.url,
            userId: request.headers["x-user-id"] ?? "anonymous",
            role: request.headers["x-role"] ?? "unknown",
            durationMs: Date.now() - started
          })
        );
      })
    );
  }
}

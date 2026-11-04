import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLoggingMiddleware.name);

  use(request: Request, response: Response, next: NextFunction) {
    const startedAt = Date.now();
    response.on('finish', () => {
      this.logger.log(`${request.method} ${response.statusCode} ${Date.now() - startedAt}ms`);
    });
    next();
  }
}

import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithContext = Request & {
  requestId: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestContextMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incomingRequestId = request.header('x-request-id');
  const requestId =
    incomingRequestId && uuidPattern.test(incomingRequestId)
      ? incomingRequestId
      : randomUUID();

  (request as RequestWithContext).requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
}

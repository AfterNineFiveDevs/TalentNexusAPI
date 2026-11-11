import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Metadata, status } from '@grpc/grpc-js';
import { rpcError } from './crawler.service';

@Injectable()
export class WorkerAuthService {
  constructor(private readonly config: ConfigService) {}
  authenticate(metadata: Metadata) {
    const expected = this.config.get<string>('CRAWLER_WORKER_TOKEN', '');
    const actual = metadata?.get('authorization')?.[0];
    const digest = (value: string) =>
      createHash('sha256').update(value).digest();
    if (
      expected.length < 32 ||
      typeof actual !== 'string' ||
      !timingSafeEqual(digest(actual), digest(`Bearer ${expected}`))
    )
      rpcError(status.UNAUTHENTICATED, 'Worker authentication required');
  }
}

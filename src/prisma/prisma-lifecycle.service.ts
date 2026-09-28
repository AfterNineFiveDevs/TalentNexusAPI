import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { db } from './db';

@Injectable()
export class PrismaLifecycleService implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await db.close();
  }
}

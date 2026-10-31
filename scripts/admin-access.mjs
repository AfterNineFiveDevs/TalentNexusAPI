import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { adminInviteSchema } from '@talent-nexus/contracts';
import { AdminAuthModule } from '../dist/admin-auth/admin-auth.module.js';
import { AdminAuthService } from '../dist/admin-auth/admin-auth.service.js';
import { validateEnvironment } from '../dist/config/environment.js';
import { db } from '../dist/prisma/db.js';

// Deliberately excludes AppModule/crawler/ingestion and opens no HTTP listener.
class OperatorModule {}
Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    AdminAuthModule,
  ],
})(OperatorModule);
const [action, email, name, acknowledgement] = process.argv.slice(2);
if (
  !['bootstrap', 'recover'].includes(action) ||
  acknowledgement !== '--confirm-access-change'
) {
  throw new Error(
    'Usage: npm run admin:access -- bootstrap|recover email "Full Name" --confirm-access-change',
  );
}
const input = adminInviteSchema.parse({ email, name });
const app = await NestFactory.createApplicationContext(OperatorModule, {
  logger: false,
});
try {
  await app.get(AdminAuthService).operator(action, input);
  console.log(
    'Administrator enrollment invitation accepted by the email provider. No credentials are printed.',
  );
} finally {
  await app.close();
  await db.close();
}

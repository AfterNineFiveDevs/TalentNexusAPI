import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller.js';
import { UserRepository } from './users.repository';

@Module({
  providers: [UsersService, UserRepository],
  exports: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}

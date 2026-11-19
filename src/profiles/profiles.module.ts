import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesRepository } from './profiles.repository';
import { ProfilesService } from './profiles.service';

@Module({
  providers: [ProfilesRepository, ProfilesService],
  controllers: [ProfilesController],
})
export class ProfilesModule {}

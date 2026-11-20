import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../auth/admin-only.decorator';
import { UsersService } from './users.service';
@ApiTags('Users')
@ApiBearerAuth()
@AdminOnly()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  getAllUser() {
    return this.users.listSafe();
  }
}

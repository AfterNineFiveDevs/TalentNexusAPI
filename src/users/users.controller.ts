import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/admin.guard';
import { UsersService } from './users.service';
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  getAllUser() {
    return this.users.listSafe();
  }
}

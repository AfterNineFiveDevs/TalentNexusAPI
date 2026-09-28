import { Controller, Get } from '@nestjs/common';
import { Public } from 'src/@decorators/public.decorator';
import { db } from 'src/prisma/db';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Get()
  @Public()
  getAllUSer() {
    const prisma = db.orm.public;
    return prisma.User.all();
  }
}

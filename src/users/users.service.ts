import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

@Injectable()
export class UsersService {
  private users: {
    userId: string | number;
    username: string;
    password: string;
  }[];
  constructor() {
    this.users = [
      {
        userId: 1,
        username: 'john',
        password: 'changeme',
      },
      {
        userId: 2,
        username: 'maria',
        password: 'guess',
      },
    ];
  }

  async create(user: any) {
    const newUser = {
      userId: randomUUID(),
      username: user.username,
      password: user.password,
    };
    this.users.push(newUser);
    return newUser;
  }

  async findOne(username) {
    return this.users.find((user) => user.username === username);
  }
}

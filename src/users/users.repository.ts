import { Injectable } from '@nestjs/common';
import {
  Role,
  SignUpMethod,
  type SignUpRequest,
} from '@talent-nexus/contracts';
import { db } from 'src/prisma/db';

@Injectable()
export class UserRepository {
  private readonly prisma: typeof db.orm.public;
  constructor() {
    this.prisma = db.orm.public;
  }

  async findByEmail(email: string) {
    return await this.prisma.User.where((u) => u.email.eq(email)).first();
  }

  async findById(id: string) {
    return await this.prisma.User.where((u) => u.id.eq(id)).first();
  }

  async createUser({ username, email, password }: SignUpRequest) {
    return this.prisma.User.create({
      name: username,
      email,
      password,
      termAccepted: true,
      role: Role.Talent,
      signUpMethod: SignUpMethod.Email,
    });
  }
}

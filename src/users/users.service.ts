import { BadRequestException, Injectable } from '@nestjs/common';
import {
  API_ERROR_MESSAGES,
  type SignUpRequest,
} from '@talent-nexus/contracts';
import { UserRepository } from './users.repository';

@Injectable()
export class UsersService {
  listSafe() {
    return this.userRepository.listSafe();
  }
  constructor(private readonly userRepository: UserRepository) {}

  async create(user: SignUpRequest) {
    const existingUser = await this.userRepository.findByEmail(user.email);
    if (existingUser) {
      throw new BadRequestException({
        message: API_ERROR_MESSAGES.BAD_REQUEST,
        errors: { email: 'Email already exists' },
      });
    }

    return this.userRepository.createUser(user);
  }

  async findOne(email: string) {
    return this.userRepository.findByEmail(email);
  }

  async findById(id: string) {
    return this.userRepository.findById(id);
  }
}

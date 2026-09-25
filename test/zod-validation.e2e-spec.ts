import { Body, Controller, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { z } from 'zod';
import { configureApiResponseHandling } from './../src/common/http/configure-api-response-handling';

class CreateProfileDto {
  static readonly schema = z.object({
    username: z.string().min(1, 'Required'),
    email: z.string().email('Provide a valid email'),
  });
}

@Controller('validation-fixture')
class ValidationFixtureController {
  @Post()
  create(@Body() body: CreateProfileDto) {
    return body;
  }
}

@Module({ controllers: [ValidationFixtureController] })
class ValidationFixtureModule {}

describe('Zod validation (e2e)', () => {
  it('returns field errors through the global pipe and exception filter', async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [ValidationFixtureModule],
    }).compile();
    const app = moduleFixture.createNestApplication();
    configureApiResponseHandling(app);
    await app.init();

    await request(app.getHttpServer())
      .post('/validation-fixture')
      .send({ username: '', email: 'invalid' })
      .expect(400)
      .expect({
        success: false,
        message: 'Validation failed',
        errors: {
          username: 'Required',
          email: 'Provide a valid email',
        },
      });

    await app.close();
  });
});

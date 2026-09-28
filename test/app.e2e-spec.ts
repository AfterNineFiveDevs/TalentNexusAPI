import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApiResponseHandling } from './../src/common/http/configure-api-response-handling';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApiResponseHandling(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ success: true, data: 'Hello World!' });
  });

  it('/auth/signup (POST) returns shared field errors for an invalid body', () => {
    return request(app.getHttpServer())
      .post('/auth/signup')
      .send({})
      .expect(400)
      .expect({
        success: false,
        message: 'Validation failed',
        errors: {
          username: 'Username is required',
          email: 'Email is required',
          password: 'Password is required',
          confirmPassword: 'Please confirm your password',
          termsAccepted: 'You must accept the terms and conditions',
        },
      });
  });
});

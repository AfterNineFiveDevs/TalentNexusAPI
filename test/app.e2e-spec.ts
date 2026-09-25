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

  it('/auth/login (POST) validates the shared DTO and returns a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'john', password: 'changeme' })
      .expect(201);

    expect(response.body).toEqual({
      success: true,
      data: { access_token: expect.any(String) },
    });
  });

  it('/auth/login (POST) returns shared field errors for an invalid body', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({})
      .expect(400)
      .expect({
        success: false,
        message: 'Validation failed',
        errors: {
          username: 'Username is required',
          password: 'Password is required',
        },
      });
  });
});

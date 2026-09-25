/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { ModulesContainer } from '@nestjs/core/injector/modules-container';
import { AppModule } from '../../app.module';
import { applyZodSchemasToSwagger } from './zod-swagger';

describe('Zod Swagger integration', () => {
  it('documents controller DTOs from their static Zod schemas', async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleFixture.createNestApplication();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test API').build(),
    );

    applyZodSchemasToSwagger(document, app.get(ModulesContainer));

    expect(document.components?.schemas?.LoginRequestDto).toMatchObject({
      type: 'object',
      properties: {
        username: { type: 'string', minLength: 1 },
        password: { type: 'string', minLength: 1 },
      },
      required: ['username', 'password'],
    });

    await app.close();
  });
});

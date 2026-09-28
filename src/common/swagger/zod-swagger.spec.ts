import { z } from 'zod';
import { addZodDtoSchemas } from './zod-swagger';

class LoginRequestDto {
  static readonly schema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  });
}

describe('addZodDtoSchemas', () => {
  it('converts a static Zod DTO schema into an OpenAPI component', () => {
    const document = {};

    addZodDtoSchemas(document, [LoginRequestDto]);

    expect(document).toEqual({
      components: {
        schemas: {
          LoginRequestDto: {
            type: 'object',
            properties: {
              username: { type: 'string', minLength: 1 },
              password: { type: 'string', minLength: 1 },
            },
            required: ['username', 'password'],
            additionalProperties: false,
          },
        },
      },
    });
  });
});

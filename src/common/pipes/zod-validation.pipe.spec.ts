import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

class CreateProfileDto {
  static readonly schema = z.object({
    username: z.string().min(1, 'Required'),
    profile: z.object({
      email: z.string().email('Provide a valid email'),
    }),
  });
}

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();
  const bodyMetadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateProfileDto,
  };

  it('returns parsed Zod DTO data', () => {
    expect(
      pipe.transform(
        {
          username: 'hanlin',
          profile: { email: 'hanlin@example.com' },
          ignored: true,
        },
        bodyMetadata,
      ),
    ).toEqual({
      username: 'hanlin',
      profile: { email: 'hanlin@example.com' },
    });
  });

  it('creates one dot-notated field error per invalid path', () => {
    try {
      pipe.transform(
        {
          username: '',
          profile: { email: 'not-an-email' },
        },
        bodyMetadata,
      );
      throw new Error('Expected Zod validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        message: 'Validation failed',
        errors: {
          username: 'Required',
          'profile.email': 'Provide a valid email',
        },
      });
    }
  });

  it('leaves parameters without a Zod DTO unchanged', () => {
    expect(pipe.transform('42', { type: 'param', metatype: String })).toBe(
      '42',
    );
  });
});

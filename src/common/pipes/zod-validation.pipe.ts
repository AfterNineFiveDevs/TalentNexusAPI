import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import {
  API_ERROR_MESSAGES,
  type ApiFieldErrors,
  type ZodDtoClass,
} from '@talent-nexus/contracts';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!this.shouldValidate(metadata) || !isZodDtoClass(metadata.metatype)) {
      return value;
    }

    const result = metadata.metatype.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    throw new BadRequestException({
      message: API_ERROR_MESSAGES.VALIDATION_FAILED,
      errors: toFieldErrors(result.error.issues),
    });
  }

  private shouldValidate(metadata: ArgumentMetadata): boolean {
    return (
      metadata.type === 'body' ||
      metadata.type === 'query' ||
      metadata.type === 'param'
    );
  }
}

function isZodDtoClass(value: unknown): value is ZodDtoClass {
  if (typeof value !== 'function' || !('schema' in value)) {
    return false;
  }

  const schema = value.schema;
  return (
    typeof schema === 'object' &&
    schema !== null &&
    'safeParse' in schema &&
    typeof schema.safeParse === 'function'
  );
}

function toFieldErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): ApiFieldErrors {
  const errors: ApiFieldErrors = {};

  for (const issue of issues) {
    const path = issue.path.length === 0 ? 'root' : issue.path.join('.');
    errors[path] ??= issue.message;
  }

  return errors;
}

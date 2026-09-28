import type { ZodDtoClass } from '@talent-nexus/contracts';
import { ModulesContainer } from '@nestjs/core/injector/modules-container';
import { z } from 'zod';

type SwaggerDocument = {
  components?: {
    schemas?: Record<string, object>;
  };
};

type ZodDtoConstructor = ZodDtoClass & { readonly name: string };

export function applyZodSchemasToSwagger(
  document: SwaggerDocument,
  modules: ModulesContainer,
): void {
  addZodDtoSchemas(document, collectZodDtos(modules));
}

export function addZodDtoSchemas(
  document: SwaggerDocument,
  dtos: Iterable<ZodDtoConstructor>,
): void {
  const schemas = ((document.components ??= {}).schemas ??= {});

  for (const dto of dtos) {
    const schema = Object.fromEntries(
      Object.entries(z.toJSONSchema(dto.schema)).filter(
        ([key]) => key !== '$schema',
      ),
    );
    schemas[dto.name] = schema;
  }
}

function collectZodDtos(modules: ModulesContainer): Set<ZodDtoConstructor> {
  const dtos = new Set<ZodDtoConstructor>();

  for (const module of modules.values()) {
    for (const wrapper of module.controllers.values()) {
      const instance: unknown = wrapper.instance;
      if (typeof instance !== 'object' || instance === null) {
        continue;
      }

      const prototype = Object.getPrototypeOf(instance) as object | null;
      if (!prototype) {
        continue;
      }

      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        const method: unknown = Object.getOwnPropertyDescriptor(
          prototype,
          methodName,
        )?.value;
        if (typeof method !== 'function') {
          continue;
        }

        const parameterTypes: unknown = Reflect.getMetadata(
          'design:paramtypes',
          prototype,
          methodName,
        );

        if (!Array.isArray(parameterTypes)) {
          continue;
        }

        for (const parameterType of parameterTypes) {
          if (isZodDtoConstructor(parameterType)) {
            dtos.add(parameterType);
          }
        }
      }
    }
  }

  return dtos;
}

function isZodDtoConstructor(value: unknown): value is ZodDtoConstructor {
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

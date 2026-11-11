import { z } from 'zod';
const meta = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});
function json(schema: z.ZodType) {
  return Object.fromEntries(
    Object.entries(z.toJSONSchema(schema)).filter(([key]) => key !== '$schema'),
  );
}
export const detailSchema = (schema: z.ZodType) =>
  json(z.object({ success: z.literal(true), data: schema }));
export const pageSchema = (schema: z.ZodType) =>
  json(z.object({ success: z.literal(true), data: z.array(schema), meta }));

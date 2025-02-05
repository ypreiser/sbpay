import { z } from 'zod';

export const sbPayRequestSchema = z.object({
  transaction_id: z.string(),
  amount: z.number().or(z.string().transform((val) => parseFloat(val))),
  currency: z.string().default("ILS"),
  customer: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  metadata: z.record(z.unknown()).optional(),
  signature: z.string(),
});

export type SBPayRequest = z.infer<typeof sbPayRequestSchema>; 
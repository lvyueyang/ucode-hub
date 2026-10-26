/**
 * 元事件（event_meta）zod schema：单一来源
 */
import { z } from "zod";

export const eventMetaCreateSchema = z.object({
  name: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  description: z.string().optional(),
});

export const eventMetaUpdateSchema = z.object({
  name: z.string().min(1).max(100),
  label: z.string().min(1).max(100).optional(),
  category: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
});

export const eventMetaDeleteSchema = z.object({
  name: z.string().min(1).max(100),
});

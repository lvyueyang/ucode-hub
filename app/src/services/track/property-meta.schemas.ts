/**
 * 元属性（property_meta）zod schema：单一来源
 */
import { z } from "zod";

export const propertyMetaCreateSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
  dataType: z.string().optional(),
  description: z.string().optional(),
});

export const propertyMetaUpdateSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(100).optional(),
  dataType: z.string().optional(),
  description: z.string().optional(),
});

export const propertyMetaDeleteSchema = z.object({
  key: z.string().min(1).max(100),
});

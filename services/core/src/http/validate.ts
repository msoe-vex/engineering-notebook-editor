import { z } from "zod";
import type { FastifyReply } from "fastify";

export function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
  reply: FastifyReply
): T | null {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue
      ? `${issue.path.join(".") || "body"}: ${issue.message}`
      : "invalid body";
    reply.code(400).send({ error: message, code: "validation_error" });
    return null;
  }
  return parsed.data;
}

export const inviteCreateSchema = z.object({
  email: z
    .union([z.string().email(), z.literal(""), z.undefined()])
    .optional()
    .transform((v) => (v ? v : undefined)),
  role: z.enum(["owner", "admin", "member"]).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(90).optional(),
});

export const secondaryEmailSchema = z.object({
  email: z.string().trim().email(),
});

export const secondaryEmailVerifySchema = z.object({
  token: z.string().trim().min(8).max(200),
});

export const notebookAccessSchema = z.object({
  mode: z.enum(["org", "restricted"]).optional(),
  teamIds: z.array(z.string().min(1).max(128)).max(200).optional(),
  userIds: z.array(z.string().min(1).max(128)).max(500).optional(),
});

export const entryCreateSchema = z.object({
  title: z.string().max(500).optional(),
  authors: z.array(z.string().max(200)).max(64).optional(),
  phase: z.string().max(120).nullable().optional(),
  date: z.string().max(32).optional(),
  folderId: z.string().max(128).nullable().optional(),
  order: z.number().optional(),
  explorerOrder: z.number().optional(),
  isTemplate: z.boolean().optional(),
  tipTapJson: z.unknown().optional(),
});

export const entryPatchSchema = entryCreateSchema
  .partial()
  .extend({
    hidden: z.boolean().optional(),
    deletedAt: z.string().nullable().optional(),
    assetIds: z.array(z.string().min(1).max(128)).max(500).optional(),
    resources: z.record(z.unknown()).optional(),
    references: z.array(z.string()).max(500).optional(),
    openCommentCount: z.number().int().optional(),
    commentCount: z.number().int().optional(),
  });

export const judgeScoreSchema = z.object({
  rubricId: z.string().trim().min(1).max(128),
  byok: z
    .object({
      provider: z.enum(["openai", "anthropic", "gemini"]),
      apiKey: z.string().min(1).max(4096),
      model: z.string().min(1).max(200),
    })
    .optional(),
});

export const adminGrantSchema = z.object({
  platformAi: z.boolean().optional(),
});

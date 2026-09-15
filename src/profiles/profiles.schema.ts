import { z } from "zod";

export const profilePasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password is too long");
export const profileDetailsSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    avatarKey: z.enum(["pine", "clay", "gold", "slate", "sage", "plum"]),
  })
  .strict();
export const createProfileSchema = profileDetailsSchema
  .extend({
    role: z.enum(["admin", "member"]),
    password: profilePasswordSchema.nullable(),
  })
  .refine((value) => value.role !== "admin" || value.password !== null, {
    message: "Admin profiles require a password",
    path: ["password"],
  });
export const updateProfileSchema = profileDetailsSchema.extend({
  role: z.enum(["admin", "member"]),
});
export const profilePasswordChangeSchema = z
  .object({
    password: profilePasswordSchema.nullable(),
  })
  .strict();
export const selectProfileSchema = z
  .object({
    password: z
      .string()
      .max(72)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password is too long"),
  })
  .strict();
export const profileParametersSchema = z.object({ profileId: z.string().uuid() });
export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export interface ProfileDto {
  id: string;
  name: string;
  avatarKey: z.infer<typeof profileDetailsSchema>["avatarKey"];
  role: "admin" | "member";
  isLocked: boolean;
}

import { z } from "zod";

export const profilePinSchema = z
  .string()
  .length(4, "Use exactly 4 digits")
  .regex(/^\d{4}$/, "Use exactly 4 digits");
export const profileDetailsSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
  })
  .strict();
export const createProfileSchema = profileDetailsSchema
  .extend({
    role: z.enum(["admin", "member"]),
    pin: profilePinSchema.nullable(),
  })
  .refine((value) => value.role !== "admin" || value.pin !== null, {
    message: "Admin profiles require a PIN",
    path: ["pin"],
  });
export const updateProfileSchema = profileDetailsSchema.extend({
  role: z.enum(["admin", "member"]),
});
export const profilePinChangeSchema = z
  .object({
    pin: profilePinSchema.nullable(),
  })
  .strict();
export const selectProfileSchema = z
  .object({
    pin: z.union([profilePinSchema, z.literal("")]),
  })
  .strict();
export const profileParametersSchema = z.object({ profileId: z.string().uuid() });
export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export interface ProfileDto {
  id: string;
  name: string;
  role: "admin" | "member";
  isLocked: boolean;
}

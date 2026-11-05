import { z } from "zod";
import { EmailSchema, PasswordSchema } from "@/lib/user-lifecycle";

export const RegistrationSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema.refine((value) => new TextEncoder().encode(value).length <= 72, "密码不能超过 72 字节"),
}).strict();

export function registrationData(email: string, passwordHash: string) {
  return { email, passwordHash, role: "USER" as const, status: "ACTIVE" as const, emailVerifiedAt: null };
}

import assert from "node:assert/strict";
import test from "node:test";
import { EmailSchema, PasswordSchema } from "./user-lifecycle";

test("user lifecycle normalizes valid email addresses", () => {
  assert.equal(EmailSchema.parse("  Reader@Example.COM "), "reader@example.com");
  assert.equal(EmailSchema.safeParse("not-an-email").success, false);
});

test("user passwords require length, upper, lower and numeric characters", () => {
  assert.equal(PasswordSchema.safeParse("LongPassword2026").success, true);
  assert.equal(PasswordSchema.safeParse("short1A").success, false);
  assert.equal(PasswordSchema.safeParse("alllowercase2026").success, false);
  assert.equal(PasswordSchema.safeParse("ALLUPPERCASE2026").success, false);
  assert.equal(PasswordSchema.safeParse("NoNumbersPresent").success, false);
});

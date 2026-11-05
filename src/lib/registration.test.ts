import assert from "node:assert/strict";
import test from "node:test";
import { RegistrationSchema, registrationData } from "./registration";
import { identityLinks } from "./registration-navigation";

test("registration validates and cannot accept an administrative role", () => {
  const valid = RegistrationSchema.parse({ email: " Reader@Example.com ", password: "ValidPassword123" });
  assert.equal(valid.email, "reader@example.com");
  assert.equal(RegistrationSchema.safeParse({ ...valid, role: "ADMIN" }).success, false);
  assert.equal(RegistrationSchema.safeParse({ ...valid, password: "short" }).success, false);
  assert.equal(RegistrationSchema.safeParse({ ...valid, password: "Aa1" + "中".repeat(24) }).success, false);
  assert.deepEqual(registrationData(valid.email, "hash"), { email: valid.email, passwordHash: "hash", role: "USER", status: "ACTIVE", emailVerifiedAt: null });
});
test("navigation offers only appropriate identity links", () => {
  assert.deepEqual(identityLinks(undefined).map(x => x.href), ["/login", "/register"]);
  assert.deepEqual(identityLinks("USER").map(x => x.href), ["/account"]);
  assert.deepEqual(identityLinks("ADMIN").map(x => x.href), ["/account", "/admin"]);
});

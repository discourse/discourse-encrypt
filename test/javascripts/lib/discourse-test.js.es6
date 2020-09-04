import User from "discourse/models/user";
import { canEnableEncrypt } from "discourse/plugins/discourse-encrypt/lib/discourse";

QUnit.module("discourse-encrypt:lib:discourse");

test("canEnableEncrypt", async (assert) => {
  Discourse.SiteSettings.encrypt_enabled = true;
  Discourse.SiteSettings.encrypt_groups = "gRoUp";

  const user = User.create({ groups: [{ name: "GrOuP" }] });

  assert.ok(canEnableEncrypt(user));
});

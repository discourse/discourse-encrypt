import User from "discourse/models/user";
import { canEnableEncrypt } from "discourse/plugins/discourse-encrypt/lib/discourse";

QUnit.module("discourse-encrypt:lib:discourse");

test("canEnableEncrypt", async (assert) => {
  const user = User.create({ groups: [{ name: "GrOuP" }] });
  const siteSettings = {
    encrypt_enabled: true,
    encrypt_groups: "gRoUp",
  };

  assert.ok(canEnableEncrypt(user, siteSettings));
});

import { acceptance, replaceCurrentUser } from "helpers/qunit-helpers";

// TODO: Figure out why `await` is not enough.
function sleep(time) {
  return new Promise(resolve => {
    setTimeout(() => resolve(), time);
  });
}

acceptance("Encrypt - Settings", {
  loggedIn: true,
  settings: { encrypt_enabled: true, encrypt_groups: "" }
});

test("encrypt settings visible only to allowed groups", async assert => {
  await visit("/u/eviltrout/preferences");
  await sleep(1500);

  assert.ok(find(".encrypt").text().length > 0, "encrypt settings are visible");

  Discourse.SiteSettings.encrypt_groups = "allowed_group";

  replaceCurrentUser({
    groups: [
      Ember.Object.create({
        id: 1,
        name: "not_allowed_group"
      })
    ]
  });

  await visit("/u/eviltrout/preferences");
  await sleep(1500);
  assert.ok(
    find(".encrypt").text().length === 0,
    "encrypt settings are not visible"
  );

  replaceCurrentUser({
    groups: [
      Ember.Object.create({
        id: 1,
        name: "not_allowed_group"
      }),
      Ember.Object.create({
        id: 2,
        name: "allowed_group"
      })
    ]
  });

  await visit("/u/eviltrout/preferences");
  await sleep(1500);
  assert.ok(find(".encrypt").text().length > 0, "encrypt settings are visible");
});

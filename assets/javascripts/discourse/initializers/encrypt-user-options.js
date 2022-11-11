import { withPluginApi } from "discourse/lib/plugin-api";

const ENCRYPT_PMS_DEFAULT = "encrypt_pms_default";

export default {
  name: "encrypt-user-options",

  initialize(container) {
    withPluginApi("0.11.0", (api) => {
      const siteSettings = container.lookup("service:site-settings");
      if (siteSettings.encrypt_enabled) {
        api.addSaveableUserOptionField(ENCRYPT_PMS_DEFAULT);
      }
    });
  },
};

import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "hook-uploads",

  initialize(container) {
    const siteSettings = container.lookup("site-settings:main");
    if (!siteSettings.encrypt_enabled) {
      return;
    }

    withPluginApi("0.8.27", api => {
      api.addComposerUploadHandler([".*"], () => {
        const controller = container.lookup("controller:composer");
        if (controller.get("model.isEncrypted")) {
          bootbox.alert(I18n.t("encrypt.encrypted_uploads"));
          return false;
        }
        return true;
      });
    });
  }
};

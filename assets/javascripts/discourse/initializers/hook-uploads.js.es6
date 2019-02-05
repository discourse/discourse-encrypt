import { withPluginApi } from "discourse/lib/plugin-api";
import { isEncryptEnabled } from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-uploads",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
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

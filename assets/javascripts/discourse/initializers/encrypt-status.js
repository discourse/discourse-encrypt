import getURL from "discourse-common/lib/get-url";
import { withPluginApi } from "discourse/lib/plugin-api";
import { deleteDb } from "discourse/plugins/discourse-encrypt/lib/database";
import {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus,
  reload,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import I18n from "I18n";

export default {
  name: "encrypt-status",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    const appEvents = container.lookup("service:app-events");
    appEvents.on("encrypt:status-changed", (skipReload) => {
      if (!skipReload) {
        reload();
      }
    });

    const status = getEncryptionStatus(currentUser);
    if (!currentUser || status !== ENCRYPT_ACTIVE) {
      deleteDb();
    }

    if (
      currentUser &&
      status === ENCRYPT_ACTIVE &&
      (!currentUser.encrypt_private ||
        Object.keys(JSON.parse(currentUser.encrypt_private)).length === 0)
    ) {
      withPluginApi("0.11.3", (api) => {
        let basePath = getURL("/").replace(/\/$/, "");
        api.addGlobalNotice(
          I18n.t("encrypt.no_backup_warn", { basePath }),
          "key-backup-notice",
          {
            level: "warn",
            dismissable: true,
            dismissDuration: moment.duration(1, "day"),
          }
        );
      });
    }

    const messageBus = container.lookup("message-bus:main");
    if (messageBus && status !== ENCRYPT_DISABLED) {
      messageBus.subscribe("/plugin/encrypt/keys", function (data) {
        currentUser.setProperties({
          encrypt_public: data.public,
          encrypt_private: data.private,
        });
        appEvents.trigger("encrypt:status-changed", true);
      });
    }
  },
};

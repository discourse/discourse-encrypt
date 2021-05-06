import I18n from "I18n";
import { withPluginApi } from "discourse/lib/plugin-api";
import { deleteDb } from "discourse/plugins/discourse-encrypt/lib/database";
import {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus,
  reload,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import getURL from "discourse-common/lib/get-url";

export default {
  name: "update-state",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    const messageBus = container.lookup("message-bus:main");
    const siteSettings = container.lookup("site-settings:main");
    const appEvents = container.lookup("service:app-events");
    appEvents.on("encrypt:status-changed", (skipReload) => {
      if (!skipReload) {
        reload();
      }
    });

    const status = getEncryptionStatus(currentUser, siteSettings);
    if (!currentUser || status !== ENCRYPT_ACTIVE) {
      deleteDb();
    }

    if (
      currentUser &&
      status === ENCRYPT_ACTIVE &&
      (!currentUser.encrypt_private ||
        Object.keys(JSON.parse(currentUser.encrypt_private)).length === 0)
    ) {
      withPluginApi("0.8.37", (api) => {
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

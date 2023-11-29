import { htmlSafe } from "@ember/template";
import { withPluginApi } from "discourse/lib/plugin-api";
import { isTesting } from "discourse-common/config/environment";
import getURL from "discourse-common/lib/get-url";
import I18n from "I18n";
import { deleteDb } from "discourse/plugins/discourse-encrypt/lib/database";
import {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus,
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "encrypt-status",

  initialize(container) {
    const currentUser = container.lookup("service:current-user");
    const appEvents = container.lookup("service:app-events");
    appEvents.on("encrypt:status-changed", (skipReload) => {
      if (!skipReload && !isTesting()) {
        window.location.reload();
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
        const warning = I18n.t("encrypt.no_backup_warn", { basePath });

        api.addGlobalNotice(htmlSafe(warning), "key-backup-notice", {
          level: "warn",
          dismissable: true,
          dismissDuration: moment.duration(1, "day"),
        });
      });
    }

    const messageBus = container.lookup("service:message-bus");
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

import Composer from "discourse/controllers/composer";
import {
  canEnableEncrypt,
  ENCRYPT_ACTIVE,
  getEncryptionStatus
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-composer-controller",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (!canEnableEncrypt(currentUser)) {
      return;
    }

    Composer.reopen({
      open(opts) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;

        if (
          opts.topic &&
          opts.topic.get("topic_key") &&
          getEncryptionStatus(Discourse.User.current()) !== ENCRYPT_ACTIVE
        ) {
          bootbox.alert(I18n.t("encrypt.status_inactive"));
          return;
        }

        return _super.call(this, ...arguments);
      }
    });
  }
};

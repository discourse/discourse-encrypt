import {
  ENCRYPT_ENABLED,
  getEncryptionStatus
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  async setupComponent(args, component) {
    const status = await getEncryptionStatus();
    component.set("isVisible", status === ENCRYPT_ENABLED);

    this.appEvents.on("encrypt:status-changed", async () => {
      const newStatus = await getEncryptionStatus();
      component.set("isVisible", newStatus === ENCRYPT_ENABLED);
    });

    // TODO: Call appEvents.off('encrypt:status-changed').
  }
};

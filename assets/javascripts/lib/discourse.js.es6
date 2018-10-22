import { exportPublicKey } from "discourse/plugins/discourse-encrypt/lib/keys";
import { loadKeyPairFromIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";

export const ENCRYPT_DISBLED = 0;
export const ENCRYPT_ENABLED = 1;
export const ENCRYPT_ACTIVE = 2;

export async function getEncryptionStatus() {
  const user = Discourse.User.current();

  const sPubKey = user.get("custom_fields.encrypt_public_key");
  const sPrvKey = user.get("custom_fields.encrypt_private_key");

  if (sPubKey && sPrvKey) {
    const [cPubKey, cPrvKey] = await loadKeyPairFromIndexedDb();
    if (cPubKey && cPrvKey && sPubKey === (await exportPublicKey(cPubKey))) {
      return ENCRYPT_ACTIVE;
    } else {
      return ENCRYPT_ENABLED;
    }
  }

  return ENCRYPT_DISBLED;
}

export async function hideComponentIfDisabled(component) {
  const status = await getEncryptionStatus();
  component.set("isEncryptEnabled", status === ENCRYPT_ENABLED);
  component.set("isEncryptActive", status === ENCRYPT_ACTIVE);

  component.appEvents.on("encrypt:status-changed", async () => {
    const newStatus = await getEncryptionStatus();
    component.set("isEncryptEnabled", newStatus === ENCRYPT_ENABLED);
    component.set("isEncryptActive", newStatus === ENCRYPT_ACTIVE);
  });

  // TODO: Call appEvents.off('encrypt:status-changed').
}

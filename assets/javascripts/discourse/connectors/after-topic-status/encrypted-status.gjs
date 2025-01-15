import icon from "discourse/helpers/d-icon";
import { i18n } from "discourse-i18n";

const EncryptedStatus = <template>
  {{~#if @outletArgs.topic.encrypted_title~}}
    <span
      title={{i18n "topic-statuses.encrypted.help"}}
      class="topic-status"
    >{{icon "user-secret"}}</span>
  {{~/if~}}
</template>;

export default EncryptedStatus;

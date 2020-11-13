import { computed } from "@ember/object";
import I18n from "I18n";
import DropdownSelectBoxComponent from "select-kit/components/dropdown-select-box";

export default DropdownSelectBoxComponent.extend({
  classNames: ["encrypt-enable-dropdown"],

  selectKitOptions: {
    icon: "bars",
    showFullTitle: false,
  },

  content: computed("importIdentity", "isEncryptEnabled", function () {
    const content = [];

    content.push({
      id: "import",
      icon: "file-import",
      name: this.importIdentity
        ? this.isEncryptEnabled
          ? I18n.t("encrypt.preferences.use_paper_key")
          : I18n.t("encrypt.preferences.generate_key")
        : I18n.t("encrypt.preferences.import"),
    });

    if (this.isEncryptEnabled) {
      content.push({
        id: "reset",
        icon: "trash-alt",
        name: I18n.t("encrypt.reset.title"),
      });
    }

    return content;
  }),
});

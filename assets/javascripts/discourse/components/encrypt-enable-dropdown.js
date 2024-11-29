import { computed } from "@ember/object";
import { classNames } from "@ember-decorators/component";
import I18n from "I18n";
import DropdownSelectBoxComponent from "select-kit/components/dropdown-select-box";
import { selectKitOptions } from "select-kit/components/select-kit";

@selectKitOptions({
  icon: "bars",
  showFullTitle: false,
})
@classNames("encrypt-enable-dropdown")
export default class EncryptEnableDropdown extends DropdownSelectBoxComponent {
  @computed("importIdentity", "isEncryptEnabled")
  get content() {
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
  }
}

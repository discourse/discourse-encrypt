import { computed } from "@ember/object";
import { classNames } from "@ember-decorators/component";
import { i18n } from "discourse-i18n";
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
          ? i18n("encrypt.preferences.use_paper_key")
          : i18n("encrypt.preferences.generate_key")
        : i18n("encrypt.preferences.import"),
    });

    if (this.isEncryptEnabled) {
      content.push({
        id: "reset",
        icon: "trash-can",
        name: i18n("encrypt.reset.title"),
      });
    }

    return content;
  }
}

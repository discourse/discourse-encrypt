import { classNames } from "@ember-decorators/component";
import I18n from "I18n";
import DropdownSelectBoxComponent from "select-kit/components/dropdown-select-box";
import { selectKitOptions } from "select-kit/components/select-kit";

@selectKitOptions({
  icon: "wrench",
  showFullTitle: false,
})
@classNames("encrypt-preferences-dropdown")
export default class EncryptPreferencesDropdown extends DropdownSelectBoxComponent {
  content = [
    {
      id: "export",
      icon: "file-export",
      name: I18n.t("encrypt.export.title"),
    },
    {
      id: "managePaperKeys",
      icon: "ticket-simple",
      name: I18n.t("encrypt.manage_paper_keys.title"),
    },
    {
      id: "decryptAll",
      icon: "unlock",
      name: I18n.t("encrypt.decrypt_all.button"),
    },
    {
      id: "rotate",
      icon: "arrows-rotate",
      name: I18n.t("encrypt.rotate.title"),
    },
    {
      id: "reset",
      icon: "trash-can",
      name: I18n.t("encrypt.reset.title"),
    },
  ];
}

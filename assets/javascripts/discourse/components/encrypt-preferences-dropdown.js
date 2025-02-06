import { classNames } from "@ember-decorators/component";
import { i18n } from "discourse-i18n";
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
      name: i18n("encrypt.export.title"),
    },
    {
      id: "managePaperKeys",
      icon: "ticket-simple",
      name: i18n("encrypt.manage_paper_keys.title"),
    },
    {
      id: "decryptAll",
      icon: "unlock",
      name: i18n("encrypt.decrypt_all.button"),
    },
    {
      id: "rotate",
      icon: "arrows-rotate",
      name: i18n("encrypt.rotate.title"),
    },
    {
      id: "reset",
      icon: "trash-can",
      name: i18n("encrypt.reset.title"),
    },
  ];
}

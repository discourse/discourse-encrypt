import DropdownSelectBoxComponent from "select-kit/components/dropdown-select-box";

export default DropdownSelectBoxComponent.extend({
  classNames: ["encrypt-preferences-dropdown"],

  selectKitOptions: {
    icon: "wrench",
    showFullTitle: false
  },

  content: [
    {
      id: "export",
      icon: "file-export",
      name: I18n.t("encrypt.export.title")
    },
    {
      id: "managePaperKeys",
      icon: "ticket-alt",
      name: I18n.t("encrypt.manage_paper_keys.title")
    },
    {
      id: "reset",
      icon: "trash-alt",
      name: I18n.t("encrypt.preferences.reset")
    }
  ]
});

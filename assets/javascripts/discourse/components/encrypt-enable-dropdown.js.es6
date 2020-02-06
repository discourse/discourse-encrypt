import DropdownSelectBoxComponent from "select-kit/components/dropdown-select-box";

export default DropdownSelectBoxComponent.extend({
  classNames: ["encrypt-enable-dropdown"],

  selectKitOptions: {
    icon: "bars",
    showFullTitle: false
  },

  content: [
    {
      id: "import",
      icon: "file-import",
      name: I18n.t("encrypt.preferences.import")
    },
    {
      id: "reset",
      icon: "trash-alt",
      name: I18n.t("encrypt.preferences.reset")
    }
  ]
});

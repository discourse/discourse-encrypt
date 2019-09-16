import DropdownSelectBoxComponent from "select-kit/components/dropdown-select-box";

export default DropdownSelectBoxComponent.extend({
  tagName: "div",
  classNames: ["encrypt-preferences-dropdown"],
  headerIcon: "wrench",
  allowInitialValueMutation: false,
  showFullTitle: false,

  computeContent() {
    const content = [];

    if (this.export) {
      content.push({
        id: "export",
        icon: "file-export",
        name: I18n.t("encrypt.export.title"),
        description: ""
      });
    }

    if (this.managePaperKeys) {
      content.push({
        id: "manage_paperkeys",
        icon: "ticket-alt",
        name: I18n.t("encrypt.manage_paperkeys.title"),
        description: ""
      });
    }

    return content;
  },

  actions: {
    onSelect(id) {
      switch (id) {
        case "export":
          this.export(this.token);
          break;
        case "manage_paperkeys":
          this.managePaperKeys(this.token);
          break;
      }
    }
  }
});

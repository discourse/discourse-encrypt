import computed from "ember-addons/ember-computed-decorators";

export default Ember.Component.extend({
  tagName: "",

  @computed("checked", "disabled")
  title(checked, disabled) {
    if (disabled) {
      return "encrypt.checkbox.disabled";
    } else if (checked) {
      return "encrypt.checkbox.checked";
    } else {
      return "encrypt.checkbox.unchecked";
    }
  },

  clicked() {
    if (!this.get("disabled")) {
      this.set("checked", !this.get("checked"));
    }
  }
});

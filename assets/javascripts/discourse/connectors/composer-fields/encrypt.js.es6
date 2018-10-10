export default {
  setupComponent(args, component) {
    component.setProperties({
      model: args.model
    });
  }
};

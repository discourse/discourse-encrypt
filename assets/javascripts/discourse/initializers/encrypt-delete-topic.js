import { getOwner } from "@ember/application";
import { ajax } from "discourse/lib/ajax";
import { withPluginApi } from "discourse/lib/plugin-api";
import Post from "discourse/models/post";
import I18n from "I18n";

export default {
  name: "encrypt-delete-topic",

  initialize() {
    withPluginApi("0.11.3", (api) => {
      api.modifyClass("controller:topic", {
        pluginId: "encrypt-delete-topic",

        permanentDeleteConfirmation(callback) {
          const dialog = getOwner(this).lookup("service:dialog");
          dialog.deleteConfirm({
            title: I18n.t("encrypt.post.delete.title"),
            message: I18n.t("encrypt.post.delete.confirm"),
            didConfirm: () => callback(),
          });
        },

        createTimer(post_id) {
          return ajax("/encrypt/encrypted_post_timers", {
            type: "POST",
            data: { post_id },
          });
        },

        deleteTimer(post_id) {
          return ajax("/encrypt/encrypted_post_timers", {
            type: "DELETE",
            data: { post_id },
          });
        },

        deleteTopic() {
          // TODO: https://github.com/emberjs/ember.js/issues/15291
          let { _super } = this;
          if (this.model.encrypted_title) {
            this.permanentDeleteConfirmation(() => {
              return this.createTimer(this.model.postStream.posts[0].id).then(
                () => this.model.destroy(this.currentUser)
              );
            });
          } else {
            return _super.call(this, ...arguments);
          }
        },

        actions: {
          deletePost(post) {
            // TODO: https://github.com/emberjs/ember.js/issues/15291
            let { _super } = this;

            if (post.encrypted_raw && post.get("post_number") !== 1) {
              this.permanentDeleteConfirmation(() => {
                return this.createTimer(post.id).then((result) => {
                  post.setProperties({ delete_at: result.delete_at });
                  return _super.call(this, ...arguments);
                });
              });
            } else {
              return _super.call(this, ...arguments);
            }
          },

          deleteSelected() {
            // TODO: https://github.com/emberjs/ember.js/issues/15291
            let { _super } = this;

            const user = this.currentUser;

            if (this.selectedAllPosts) {
              this.send("toggleMultiSelect");
              return this.deleteTopic();
            }

            if (this.selectedPosts[0].encrypted_raw) {
              this.permanentDeleteConfirmation(() => {
                return this.createTimer(this.selectedPostIds).then((result) => {
                  Post.deleteMany(this.selectedPostIds);
                  this.get("model.postStream.posts").forEach((p) => {
                    this.postSelected(p) &&
                      p.setDeletedState(user) &&
                      p.setProperties({
                        delete_at: result.delete_at,
                        deleted_at: new Date(),
                        deleted_by: user,
                      });
                  });
                  this.send("toggleMultiSelect");
                });
              });
            } else {
              return _super.call(this, ...arguments);
            }
          },

          recoverTopic() {
            // TODO: https://github.com/emberjs/ember.js/issues/15291
            let { _super } = this;

            if (this.model.encrypted_title) {
              return this.deleteTimer(this.model.postStream.posts[0].id).then(
                () => {
                  this.model.postStream.posts[0].setProperties({
                    delete_at: false,
                  });
                  return _super.call(this, ...arguments);
                }
              );
            } else {
              return _super.call(this, ...arguments);
            }
          },

          recoverPost(post) {
            // TODO: https://github.com/emberjs/ember.js/issues/15291
            let { _super } = this;

            if (post.encrypted_raw) {
              return this.deleteTimer(post.id).then(() => {
                post.setProperties({ delete_at: false });
                return _super.call(this, ...arguments);
              });
            } else {
              return _super.call(this, ...arguments);
            }
          },
        },
      });
    });
  },
};

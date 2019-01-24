# name: discourse-encrypt
# about: Provides encrypted communication channels through Discourse.
# version: 0.1
# authors: Dan Ungureanu
# url: https://github.com/udan11/discourse-encrypt.git

enabled_site_setting :encrypt_enabled

# Register custom stylesheet.
register_asset "stylesheets/common/encrypt.scss"
[ "exchange",  "file-export", "lock", "times", "unlock" ].each { |i| register_svg_icon i }

# Register custom user fields to store user's key pair (public and private key)
# and passphrase salt.
DiscoursePluginRegistry.serialized_current_user_fields << "encrypt_public_key"
DiscoursePluginRegistry.serialized_current_user_fields << "encrypt_private_key"
DiscoursePluginRegistry.serialized_current_user_fields << "encrypt_salt"

after_initialize do

  Rails.configuration.filter_parameters << :private_key

  module ::DiscourseEncrypt
    PLUGIN_NAME = 'discourse-encrypt'

    Store = PluginStore.new(PLUGIN_NAME)

    class Engine < ::Rails::Engine
      engine_name PLUGIN_NAME
      isolate_namespace DiscourseEncrypt
    end

    # Manages user and topic keys.
    class EncryptController < ::ApplicationController
      requires_plugin PLUGIN_NAME

      before_action :ensure_logged_in
      skip_before_action :check_xhr

      # Saves a user's key pair using custom fields.
      #
      # Params:
      # +public_key+::  Serialized public key. This parameter is optional when
      #                 the private key is updated (changed passphrase).
      # +private_key+:: Serialized private key.
      def update_keys
        public_key  = params.require(:public_key)
        private_key = params.require(:private_key)
        salt        = params.require(:salt)

        # Check if encryption is already enabled (but not changing passphrase).
        old_public_key = current_user.custom_fields['encrypt_public_key']
        if old_public_key && old_public_key != public_key
          return render_json_error(I18n.t("encrypt.enabled_already"), status: 409)
        end

        current_user.custom_fields['encrypt_public_key']  = public_key
        current_user.custom_fields['encrypt_private_key'] = private_key
        current_user.custom_fields['encrypt_salt']        = salt
        current_user.save!

        render json: success_json
      end

      # Gets public keys of a set of users.
      #
      # Params:
      # +usernames+::   Array of usernames.
      #
      # Returns a hash of usernames and public keys.
      def show_user
        usernames = params.require(:usernames)

        keys = Hash[User.where(username: usernames).map { |u| [u.username, u.custom_fields['encrypt_public_key']] }]

        render json: keys
      end

      # Saves encrypted topic title and a set of keys for multiple users.
      #
      # Params:
      # +topic_id+::  ID of topic which can be decrypted using the given keys.
      # +title+::     Encrypted title of topic which is going to be saved in a
      #               topic custom field.
      # +keys+::      Hash of usernames and keys to be saved in plugin's store.
      #               This parameter is optional when editing a topic's title.
      def update_topic
        topic_id = params.require(:topic_id)

        topic = Topic.find_by(id: topic_id)
        if !Guardian.new(current_user).can_see_topic?(topic)
          return render json: failed_json, status: 403
        end

        if title = params[:title]
          # Title may be missing when inviting new users into topic.
          topic.custom_fields["encrypted_title"] = title
          topic.save!
        end

        if keys = params[:keys]
          # Keys may be missing when editing a topic.
          users = Hash[User.where(username: keys.keys).map { |u| [u.username, u] }]
          keys.each { |u, k| Store.set("key_#{topic_id}_#{users[u].id}", k) }
        end

        render json: success_json
      end

      # Deletes topic keys for a set of users.
      #
      # Params:
      # +usernames+::   Array of usernames.
      def destroy_topic
        topic_id = params.require(:topic_id)
        usernames = params.require(:usernames)

        topic = Topic.find_by(id: topic_id)
        if !Guardian.new(current_user).can_see_topic?(topic)
          return render json: failed_json, status: 403
        end

        users = User.where(username: usernames)
        users.each { |u| Store.remove("key_#{topic_id}_#{u.id}") }

        render json: success_json
      end
    end
  end

  add_preloaded_topic_list_custom_field("encrypted_title")
  CategoryList.preloaded_topic_custom_fields << "encrypted_title"

  module PostExtensions

    # Patch method to hide excerpt of encrypted message (i.e. in push
    # notifications).
    def excerpt(maxlength = nil, options = {})
      if topic.custom_fields["encrypted_title"]
        maxlength ||= SiteSetting.post_excerpt_maxlength

        return I18n.t("encrypt.encrypted_excerpt")[0..maxlength]
      end

      super(maxlength, options)
    end

    # Hide version (staff) and public version (regular users) because post
    # revisions will not be decrypted.
    def version
      topic&.custom_fields["encrypted_title"] ? 1 : super
    end

    def public_version
      topic&.custom_fields["encrypted_title"] ? 1 : super
    end
  end

  class ::Post
    prepend PostExtensions
  end

  # Send plugin-specific topic data to client via serializers.
  #
  # +TopicViewSerializer+ and +BasicTopicSerializer+ should cover all topics
  # that are serialized over to the client.

  # +encrypted_title+
  #
  # Topic title encrypted with topic key.

  add_to_serializer(:topic_view, :encrypted_title, false) do
    object.topic.custom_fields["encrypted_title"]
  end

  add_to_serializer(:topic_view, :include_encrypted_title?) do
    scope&.user.present? && object.topic.private_message?
  end

  add_to_serializer(:basic_topic, :encrypted_title, false) do
    object.custom_fields["encrypted_title"]
  end

  add_to_serializer(:basic_topic, :include_encrypted_title?) do
    scope&.user.present? && object.private_message?
  end

  add_to_serializer(:listable_topic, :encrypted_title, false) do
    object.custom_fields["encrypted_title"]
  end

  add_to_serializer(:listable_topic, :include_encrypted_title?) do
    scope&.user.present? && object.private_message?
  end

  add_to_serializer(:topic_list_item, :encrypted_title, false) do
    object.custom_fields["encrypted_title"]
  end

  add_to_serializer(:topic_list_item, :include_encrypted_title?) do
    scope&.user.present? && object.private_message?
  end

  # +topic_key+
  #
  # Topic's key encrypted with user's public key.
  #
  # This value is different for every user and can be decrypted only by the
  # paired private key.

  add_to_serializer(:topic_view, :topic_key, false) do
    PluginStore.get(DiscourseEncrypt::PLUGIN_NAME, "key_#{object.topic.id}_#{scope.user.id}")
  end

  add_to_serializer(:topic_view, :include_topic_key?) do
    scope&.user.present? && object.topic.private_message?
  end

  add_to_serializer(:basic_topic, :topic_key, false) do
    PluginStore.get(DiscourseEncrypt::PLUGIN_NAME, "key_#{object.id}_#{scope.user.id}")
  end

  add_to_serializer(:basic_topic, :include_topic_key?) do
    scope&.user.present? && object.private_message?
  end

  add_to_serializer(:listable_topic, :topic_key, false) do
    PluginStore.get(DiscourseEncrypt::PLUGIN_NAME, "key_#{object.id}_#{scope.user.id}")
  end

  add_to_serializer(:listable_topic, :include_topic_key?) do
    scope&.user.present? && object.private_message?
  end

  add_to_serializer(:topic_list_item, :topic_key, false) do
    PluginStore.get(DiscourseEncrypt::PLUGIN_NAME, "key_#{object.id}_#{scope.user.id}")
  end

  add_to_serializer(:topic_list_item, :include_topic_key?) do
    scope&.user.present? && object.private_message?
  end

  DiscourseEncrypt::Engine.routes.draw do
    put    '/encrypt/keys'  => 'encrypt#update_keys'
    get    '/encrypt/user'  => 'encrypt#show_user'
    put    '/encrypt/topic' => 'encrypt#update_topic'
    delete '/encrypt/topic' => 'encrypt#destroy_topic'
  end

  Discourse::Application.routes.append do
    mount ::DiscourseEncrypt::Engine, at: '/'
  end
end

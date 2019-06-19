# frozen_string_literal: true

# name: discourse-encrypt
# about: Provides encrypted communication channels through Discourse.
# version: 0.1
# authors: Dan Ungureanu
# url: https://github.com/udan11/discourse-encrypt.git

enabled_site_setting :encrypt_enabled

# Register custom stylesheet.
register_asset 'stylesheets/common/encrypt.scss'
%w[exchange-alt far-clipboard file-export lock times trash-alt unlock].each { |i| register_svg_icon(i) }

# Register custom user fields to store user's key pair (public and private key)
# and passphrase salt.
DiscoursePluginRegistry.serialized_current_user_fields << 'encrypt_public'
DiscoursePluginRegistry.serialized_current_user_fields << 'encrypt_private'

after_initialize do
  Rails.configuration.filter_parameters << :encrypt_private

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
      before_action :ensure_staff, only: :reset_user
      skip_before_action :check_xhr

      # Saves a user's identity in their custom fields.
      #
      # Params:
      # +public+::    Serialized public identity
      # +private+::   Serialized private identity
      #
      # Returns status code 200 on success or 409 if user already has an
      # identity and public identities mismatch.
      def update_keys
        public_identity  = params.require(:public)
        private_identity = params.require(:private)

        # Check if encrypt settings are visible to user.
        groups = current_user.groups.pluck(:name)
        encrypt_groups = SiteSetting.encrypt_groups.split('|')
        raise Discourse::InvalidAccess if !SiteSetting.encrypt_groups.empty? && (groups & encrypt_groups).empty?

        # Check if encryption is already enabled (but not changing passphrase).
        old_identity = current_user.custom_fields['encrypt_public']
        if old_identity && old_identity != public_identity
          return render_json_error(I18n.t('encrypt.enabled_already'), status: 409)
        end

        current_user.custom_fields['encrypt_public'] = public_identity
        current_user.custom_fields['encrypt_private'] = private_identity
        current_user.save_custom_fields

        render json: success_json
      end

      # Gets public identities of a set of users.
      #
      # Params:
      # +usernames+::   Array of usernames
      #
      # Returns status code 200 and a hash of usernames and their public
      # identities.
      def show_user
        usernames = params.require(:usernames)

        identities = Hash[User.where(username: usernames).map { |u| [u.username, u.custom_fields['encrypt_public']] }]

        render json: identities
      end

      # Resets encryption keys for a user.
      #
      # Params:
      # +user_id+::   ID of user to be reset
      #
      # Returns status code 200 after user is reset.
      def reset_user
        user_id = params.require(:user_id)

        user = User.find_by(id: user_id)
        raise Discourse::NotFound if user.blank?

        if params[:everything] == 'true'
          TopicAllowedUser
            .joins(topic: :_custom_fields)
            .where(topic_custom_fields: { name: 'encrypted_title' })
            .where(topic_allowed_users: { user_id: user.id })
            .delete_all

          PluginStoreRow
            .where(plugin_name: 'discourse-encrypt')
            .where("key LIKE 'key_%_' || ?", user.id)
            .delete_all
        end

        # Delete encryption keys.
        user.custom_fields.delete('encrypt_public')
        user.custom_fields.delete('encrypt_private')
        user.save_custom_fields

        render json: success_json
      end
    end
  end

  add_preloaded_topic_list_custom_field('encrypted_title')
  CategoryList.preloaded_topic_custom_fields << 'encrypted_title'

  # Hide cooked content.
  on(:post_process_cooked) do |doc, post|
    if post.is_encrypted? && post.raw.match(/\A[A-Za-z0-9+\\\/=]+(\n.*)?\Z/)
      doc.inner_html = "<p>#{I18n.t('js.encrypt.encrypted_post')}</p>"
    end
  end

  # Hide cooked content in email.
  on(:reduce_cooked) do |fragment, post|
    if post && post.is_encrypted? && post.raw.match(/\A[A-Za-z0-9+\\\/=]+(\n.*)?\Z/)
      fragment.inner_html = "<p>#{I18n.t('js.encrypt.encrypted_post_email')}</p>"
    end
  end

  # Handle new post creation.
  add_permitted_post_create_param(:encrypted_title)
  add_permitted_post_create_param(:encrypted_raw)
  add_permitted_post_create_param(:encrypted_keys)

  NewPostManager.add_handler do |manager|
    next if !manager.args[:encrypted_raw]

    if (encrypted_title = manager.args[:encrypted_title])
      manager.args[:topic_opts] ||= {}
      manager.args[:topic_opts][:custom_fields] ||= {}
      manager.args[:topic_opts][:custom_fields][:encrypted_title] = encrypted_title
    end

    if encrypted_raw = manager.args[:encrypted_raw]
      manager.args[:raw] = encrypted_raw
    end

    result = manager.perform_create_post
    if result.success? && encrypted_keys = manager.args[:encrypted_keys]
      keys = JSON.parse(encrypted_keys)
      topic_id = result.post.topic_id
      users = Hash[User.where(username: keys.keys).map { |u| [u.username, u] }]

      keys.each { |u, k| DiscourseEncrypt::Store.set("key_#{topic_id}_#{users[u].id}", k) }
    end

    result
  end

  module TopicExtensions
    def is_encrypted?
      !!(private_message? &&
         custom_fields &&
         custom_fields['encrypted_title'])
    end
  end

  ::Topic.class_eval { prepend TopicExtensions }

  module PostExtensions
    def is_encrypted?
      !!(topic && topic.is_encrypted?)
    end
  end

  ::Post.class_eval { prepend PostExtensions }

  module TopicsControllerExtensions
    def update
      if encrypted_title = params[:encrypted_title]
        @topic ||= Topic.find_by(id: params[:topic_id])
        guardian.ensure_can_edit!(@topic)

        @topic.custom_fields['encrypted_title'] = params.delete(:encrypted_title)
        @topic.save_custom_fields
      end

      super
    end

    def invite
      if params[:key] && params[:user]
        @topic = Topic.find_by(id: params[:topic_id])
        @user = User.find_by_username_or_email(params[:user])
        guardian.ensure_can_invite_to!(@topic)

        DiscourseEncrypt::Store.set("key_#{@topic.id}_#{@user.id}", params[:key])
      end

      super
    end

    def remove_allowed_user
      @topic ||= Topic.find_by(id: params[:topic_id])
      @user ||= User.find_by(username: params[:username])
      guardian.ensure_can_remove_allowed_users!(@topic, @user)

      DiscourseEncrypt::Store.remove("key_#{@topic.id}_#{@user.id}")

      super
    end
  end

  ::TopicsController.class_eval { prepend TopicsControllerExtensions }

  # Send plugin-specific topic data to client via serializers.
  #
  # +TopicViewSerializer+ and +BasicTopicSerializer+ should cover all topics
  # that are serialized over to the client.

  add_to_serializer(:post, :encrypted_raw, false) do
    object.raw
  end

  add_to_serializer(:post, :include_encrypted_raw?) do
    object.is_encrypted?
  end

  # +encrypted_title+
  #
  # Topic title encrypted with topic key.

  add_to_serializer(:topic_view, :encrypted_title, false) do
    object.topic.custom_fields['encrypted_title']
  end

  add_to_serializer(:topic_view, :include_encrypted_title?) do
    scope&.user.present? && object.topic.private_message?
  end

  add_to_serializer(:basic_topic, :encrypted_title, false) do
    object.custom_fields['encrypted_title']
  end

  add_to_serializer(:basic_topic, :include_encrypted_title?) do
    scope&.user.present? && object.private_message?
  end

  add_to_serializer(:listable_topic, :encrypted_title, false) do
    object.custom_fields['encrypted_title']
  end

  add_to_serializer(:listable_topic, :include_encrypted_title?) do
    scope&.user.present? && object.private_message?
  end

  add_to_serializer(:topic_list_item, :encrypted_title, false) do
    object.custom_fields['encrypted_title']
  end

  add_to_serializer(:topic_list_item, :include_encrypted_title?) do
    scope&.user.present? && object.private_message?
  end

  add_to_serializer(:notification, :encrypted_title, false) do
    object.topic.custom_fields['encrypted_title']
  end

  add_to_serializer(:notification, :include_encrypted_title?) do
    scope&.user.present? && object&.topic&.private_message?
  end

  # +topic_key+
  #
  # Topic's key encrypted with user's public key.
  #
  # This value is different for every user and can be decrypted only by the
  # paired private key.

  add_to_serializer(:topic_view, :topic_key, false) do
    DiscourseEncrypt::Store.get("key_#{object.topic.id}_#{scope.user.id}")
  end

  add_to_serializer(:topic_view, :include_topic_key?) do
    scope&.user.present? && object.topic.private_message?
  end

  add_to_serializer(:basic_topic, :topic_key, false) do
    DiscourseEncrypt::Store.get("key_#{object.id}_#{scope.user.id}")
  end

  add_to_serializer(:basic_topic, :include_topic_key?) do
    scope&.user.present? && object.private_message?
  end

  add_to_serializer(:listable_topic, :topic_key, false) do
    DiscourseEncrypt::Store.get("key_#{object.id}_#{scope.user.id}")
  end

  add_to_serializer(:listable_topic, :include_topic_key?) do
    scope&.user.present? && object.private_message?
  end

  add_to_serializer(:topic_list_item, :topic_key, false) do
    DiscourseEncrypt::Store.get("key_#{object.id}_#{scope.user.id}")
  end

  add_to_serializer(:topic_list_item, :include_topic_key?) do
    scope&.user.present? && object.private_message?
  end

  add_to_serializer(:notification, :topic_key, false) do
    DiscourseEncrypt::Store.get("key_#{object.topic.id}_#{scope.user.id}")
  end

  add_to_serializer(:notification, :include_topic_key?) do
    scope&.user.present? && object&.topic&.private_message?
  end

  # +topic_id+ and +raws+
  #
  # Topic's ID and previous and current raw values for encrypted topics.
  #
  # These values are required by `Post.loadRevision` to decrypt the
  # ciphertexts and perform client-sided diff.

  add_to_serializer(:post_revision, :topic_id) do
    post.topic_id
  end

  add_to_serializer(:post_revision, :include_topic_id?) do
    post.is_encrypted?
  end

  add_to_serializer(:post_revision, :raws) do
    { previous: previous["raw"], current: current["raw"] }
  end

  add_to_serializer(:post_revision, :include_raws?) do
    post.is_encrypted?
  end

  DiscourseEncrypt::Engine.routes.draw do
    put  '/encrypt/keys'  => 'encrypt#update_keys'
    get  '/encrypt/user'  => 'encrypt#show_user'
    post '/encrypt/reset' => 'encrypt#reset_user'
  end

  Discourse::Application.routes.append do
    mount ::DiscourseEncrypt::Engine, at: '/'
  end
end

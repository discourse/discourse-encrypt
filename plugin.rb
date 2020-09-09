# frozen_string_literal: true

# name: discourse-encrypt
# about: Provides encrypted communication channels through Discourse.
# version: 1.0
# authors: Dan Ungureanu
# url: https://github.com/udan11/discourse-encrypt.git

enabled_site_setting :encrypt_enabled

register_asset 'stylesheets/common/encrypt.scss'
register_asset "stylesheets/colors.scss", :color_definitions
%w[bars exchange-alt far-clipboard file-export file-import lock plus ticket-alt times trash-alt unlock wrench].each { |i| register_svg_icon(i) }

Rails.configuration.filter_parameters << :encrypt_private

after_initialize do
  module ::DiscourseEncrypt
    PLUGIN_NAME = 'discourse-encrypt'
  end

  load File.expand_path('../app/controllers/encrypt_controller.rb', __FILE__)
  load File.expand_path('../app/models/encrypted_topics_user.rb', __FILE__)
  load File.expand_path('../app/models/encrypted_topics_data.rb', __FILE__)
  load File.expand_path('../app/models/user_encryption_key.rb', __FILE__)
  load File.expand_path('../app/jobs/scheduled/encrypt_consistency.rb', __FILE__)
  load File.expand_path('../lib/encrypted_post_creator.rb', __FILE__)
  load File.expand_path('../lib/openssl.rb', __FILE__)
  load File.expand_path('../lib/post_extensions.rb', __FILE__)
  load File.expand_path('../lib/topic_extensions.rb', __FILE__)
  load File.expand_path('../lib/topics_controller_extensions.rb', __FILE__)
  load File.expand_path('../lib/user_extensions.rb', __FILE__)
  load File.expand_path('../lib/email_sender_extensions.rb', __FILE__)
  load File.expand_path('../app/mailers/user_notifications_extensions.rb', __FILE__)

  class DiscourseEncrypt::Engine < Rails::Engine
    engine_name DiscourseEncrypt::PLUGIN_NAME
    isolate_namespace DiscourseEncrypt
  end

  DiscourseEncrypt::Engine.routes.draw do
    put    '/encrypt/keys'  => 'encrypt#update_keys'
    delete '/encrypt/keys'  => 'encrypt#delete_key'
    get    '/encrypt/user'  => 'encrypt#show_user'
    post   '/encrypt/reset' => 'encrypt#reset_user'
    put    '/encrypt/post'  => 'encrypt#update_post'
  end

  Discourse::Application.routes.append do
    mount DiscourseEncrypt::Engine, at: '/'
  end

  reloadable_patch do |plugin|
    Post.class_eval              { prepend PostExtensions }
    Topic.class_eval             { prepend TopicExtensions }
    TopicsController.class_eval  { prepend TopicsControllerExtensions }
    User.class_eval              { prepend UserExtensions }
    Email::Sender.class_eval     { prepend EmailSenderExtensions }
    UserNotifications.class_eval { prepend UserNotificationsExtensions }
  end

  # Send plugin-specific topic data to client via serializers.
  #
  # +TopicViewSerializer+ and +BasicTopicSerializer+ should cover all topics
  # that are serialized over to the client.

  add_to_serializer(:post, :encrypted_raw, false) do
    object.raw
  end

  add_to_serializer(:post, :include_encrypted_raw?) do
    object.topic&.is_encrypted?
  end

  # +encrypted_title+
  #
  # Topic title encrypted with topic key.

  add_to_serializer(:topic_view, :encrypted_title, false) do
    object.topic.encrypted_topics_data&.title
  end

  add_to_serializer(:topic_view, :include_encrypted_title?) do
    scope&.user.present? && object.topic.private_message?
  end

  add_to_serializer(:basic_topic, :encrypted_title, false) do
    object.encrypted_topics_data&.title
  end

  add_to_serializer(:basic_topic, :include_encrypted_title?) do
    scope&.user.present? && object.private_message?
  end

  add_to_serializer(:notification, :encrypted_title, false) do
    object.topic.encrypted_topics_data&.title
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
    object.topic.encrypted_topics_users.find { |topic_user| topic_user.user_id == scope.user.id }&.key
  end

  add_to_serializer(:topic_view, :include_topic_key?) do
    scope&.user.present? && object.topic.private_message?
  end

  add_to_serializer(:basic_topic, :topic_key, false) do
    object.encrypted_topics_users.find { |topic_user| topic_user.user_id == scope.user.id }&.key
  end

  add_to_serializer(:basic_topic, :include_topic_key?) do
    scope&.user.present? && object.private_message?
  end

  add_to_serializer(:notification, :topic_key, false) do
    object.topic.encrypted_topics_users.find { |topic_user| topic_user.user_id == scope.user.id }&.key
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
    post.topic&.is_encrypted?
  end

  add_to_serializer(:post_revision, :raws) do
    { previous: previous['raw'], current: current['raw'] }
  end

  add_to_serializer(:post_revision, :include_raws?) do
    post.topic&.is_encrypted?
  end

  add_to_serializer(:current_user, :encrypt_public) do
    object.user_encryption_key&.encrypt_public
  end

  add_to_serializer(:current_user, :encrypt_private) do
    object.user_encryption_key&.encrypt_private
  end

  #
  # Hide cooked content.
  #

  Plugin::Filter.register(:after_post_cook) do |post, cooked|
    if post.is_encrypted?
      cooked.gsub!(post.ciphertext, I18n.t('js.encrypt.encrypted_post'))
    else
      cooked
    end
  end

  on(:post_process_cooked) do |doc, post|
    if post&.is_encrypted?
      doc.inner_html.gsub!(post.ciphertext, I18n.t('js.encrypt.encrypted_post'))
    end
  end

  # Notifications
  on(:reduce_excerpt) do |doc, options|
    if options[:post]&.is_encrypted?
      doc.inner_html = "<p>#{I18n.t('js.encrypt.encrypted_post_email')}</p>"
    end
  end

  # Email
  on(:reduce_cooked) do |fragment, post|
    if post&.is_encrypted?
      fragment.inner_html = "<p>#{I18n.t('js.encrypt.encrypted_post_email')}</p>"
    end
  end

  #
  # Handle new post creation.
  #

  add_permitted_post_create_param(:encrypted_title)
  add_permitted_post_create_param(:encrypted_raw)
  add_permitted_post_create_param(:encrypted_keys)

  # TODO: Remove if check once Discourse 2.6 is stable
  if respond_to?(:register_search_topic_eager_load)
    register_search_topic_eager_load do |opts|
      %i(encrypted_topics_users encrypted_topics_data) if opts[:search_pms] && SiteSetting.encrypt_enabled?
    end
  end

  NewPostManager.add_handler do |manager|
    next if !manager.args[:encrypted_raw]

    if manager.args[:encrypted_title]
      if manager.args[:target_recipients].blank?
        result = NewPostResult.new(:created_post, false)
        result.errors.add(:base, I18n.t('activerecord.errors.models.topic.attributes.base.no_user_selected'))
        next result
      end

      if !manager.args[:encrypted_keys]
        result = NewPostResult.new(:created_post, false)
        result.errors.add(:base, I18n.t('encrypt.no_encrypt_keys'))
        next result
      end
    end

    manager.args[:raw] = manager.args[:encrypted_raw]

    result = manager.perform_create_post
    if result.success? && encrypted_keys = manager.args[:encrypted_keys]
      keys = JSON.parse(encrypted_keys)
      topic_id = result.post.topic_id
      users = Hash[User.where(username: keys.keys).map { |u| [u.username, u] }]

      keys.each { |u, k| EncryptedTopicsUser.create!(topic_id: topic_id, user_id: users[u].id, key: k) }
    end

    if result.success? && encrypted_title = manager.args[:encrypted_title]
      encrypt_topic_title = EncryptedTopicsData.find_or_initialize_by(topic_id: result.post.topic_id)
      encrypt_topic_title.update!(title: encrypted_title)
    end

    result
  end

  # Delete TopicAllowedUser records for users who do not have the key
  on(:post_created) do |post, opts, user|
    if post.post_number > 1 && post.topic&.is_encrypted? && !EncryptedTopicsUser.find_by(topic_id: post.topic_id, user_id: user.id)&.key
      TopicAllowedUser.find_by(user_id: user.id, topic_id: post.topic_id).delete
    end
  end
end

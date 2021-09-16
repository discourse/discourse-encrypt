# frozen_string_literal: true

# name: discourse-encrypt
# about: Provides encrypted communication channels through Discourse.
# version: 1.0
# authors: Dan Ungureanu
# url: https://github.com/udan11/discourse-encrypt.git
# transpile_js: true

enabled_site_setting :encrypt_enabled

register_asset 'stylesheets/common/encrypt.scss'
register_asset "stylesheets/colors.scss", :color_definitions
%w[bars exchange-alt far-clipboard file-export file-import lock plus discourse-trash-clock ticket-alt times trash-alt unlock wrench].each { |i| register_svg_icon(i) }

Rails.configuration.filter_parameters << :encrypt_private

after_initialize do
  module ::DiscourseEncrypt
    PLUGIN_NAME = 'discourse-encrypt'
  end

  require_relative 'app/controllers/encrypt_controller.rb'
  require_relative 'app/controllers/encrypted_post_timers_controller.rb'
  require_relative 'app/jobs/scheduled/encrypt_consistency.rb'
  require_relative 'app/jobs/scheduled/encrypted_post_timer_evaluator.rb'
  require_relative 'app/mailers/user_notifications_extensions.rb'
  require_relative 'app/models/encrypted_post_timer.rb'
  require_relative 'app/models/encrypted_topics_data.rb'
  require_relative 'app/models/encrypted_topics_user.rb'
  require_relative 'app/models/user_encryption_key.rb'
  require_relative 'lib/email_sender_extensions.rb'
  require_relative 'lib/encrypted_post_creator.rb'
  require_relative 'lib/encrypted_search.rb'
  require_relative 'lib/grouped_search_result_serializer_extension.rb'
  require_relative 'lib/openssl.rb'
  require_relative 'lib/post_actions_controller_extensions.rb'
  require_relative 'lib/post_extensions.rb'
  require_relative 'lib/site_setting_extensions.rb'
  require_relative 'lib/topic_extensions.rb'
  require_relative 'lib/topic_guardian_extensions.rb'
  require_relative 'lib/topic_view_serializer_extension.rb'
  require_relative 'lib/topics_controller_extensions.rb'
  require_relative 'lib/upload_validator_extensions.rb'
  require_relative 'lib/user_extensions.rb'
  require_relative 'lib/user_notification_renderer_extensions.rb'

  class DiscourseEncrypt::Engine < Rails::Engine
    engine_name DiscourseEncrypt::PLUGIN_NAME
    isolate_namespace DiscourseEncrypt
  end

  DiscourseEncrypt::Engine.routes.draw do
    put    '/encrypt/keys'                  => 'encrypt#update_keys'
    delete '/encrypt/keys'                  => 'encrypt#delete_key'
    get    '/encrypt/user'                  => 'encrypt#show_user'
    post   '/encrypt/reset'                 => 'encrypt#reset_user'
    put    '/encrypt/post'                  => 'encrypt#update_post'
    get    '/encrypt/stats'                 => 'encrypt#stats'
    get    '/encrypt/posts'                 => 'encrypt#posts'
    get    '/encrypt/rotate'                => 'encrypt#show_all_keys'
    put    '/encrypt/rotate'                => 'encrypt#update_all_keys'
    post   '/encrypt/encrypted_post_timers' => 'encrypted_post_timers#create'
    delete '/encrypt/encrypted_post_timers' => 'encrypted_post_timers#destroy'
  end

  Discourse::Application.routes.prepend do
    mount DiscourseEncrypt::Engine, at: '/'
  end

  reloadable_patch do |plugin|
    Email::Sender.class_eval                 { prepend DiscourseEncrypt::EmailSenderExtensions }
    GroupedSearchResultSerializer.class_eval { prepend DiscourseEncrypt::GroupedSearchResultSerializerExtension }
    Post.class_eval                          { prepend DiscourseEncrypt::PostExtensions }
    PostActionsController.class_eval         { prepend DiscourseEncrypt::PostActionsControllerExtensions }
    Topic.class_eval                         { prepend DiscourseEncrypt::TopicExtensions }
    TopicGuardian.class_eval                 { prepend DiscourseEncrypt::TopicGuardianExtension }
    TopicsController.class_eval              { prepend DiscourseEncrypt::TopicsControllerExtensions }
    TopicViewSerializer.class_eval           { prepend DiscourseEncrypt::TopicViewSerializerExtension }
    UploadValidator.class_eval               { prepend DiscourseEncrypt::UploadValidatorExtensions }
    User.class_eval                          { prepend DiscourseEncrypt::UserExtensions }
    UserNotifications.class_eval             { prepend DiscourseEncrypt::UserNotificationsExtensions }

    SiteSetting.singleton_class.prepend                DiscourseEncrypt::SiteSettingExtensions
    UserNotificationRenderer.singleton_class.prepend   DiscourseEncrypt::UserNotificationRendererExtensions
  end

  register_search_topic_eager_load do |opts|
    if SiteSetting.encrypt_enabled? && opts[:search_pms]
      %i(encrypted_topics_users encrypted_topics_data)
    end
  end

  TopicList.on_preload do |topics, topic_list|
    if SiteSetting.encrypt_enabled? && topics.size > 0 && topic_list.current_user
      topic_ids = topics.map(&:id)
      encrypted_topics_data = EncryptedTopicsData.where(topic_id: topic_ids).index_by(&:topic_id)
      encrypted_topics_users = EncryptedTopicsUser.where(user_id: topic_list.current_user.id, topic_id: topic_ids).index_by(&:topic_id)

      topics.each do |topic|
        topic.association(:encrypted_topics_data).target = encrypted_topics_data[topic.id]
        topic.association(:encrypted_topics_users).target = [encrypted_topics_users[topic.id]].compact
      end
    end
  end

  BookmarkQuery.on_preload do |bookmarks, query|
    if SiteSetting.encrypt_enabled? && bookmarks.size > 0
      user_id = bookmarks.first.user_id
      topic_ids = bookmarks.map(&:topic_id)

      encrypted_topics_data = EncryptedTopicsData.where(topic_id: topic_ids).index_by(&:topic_id)
      encrypted_topics_users = EncryptedTopicsUser.where(user_id: user_id, topic_id: topic_ids).index_by(&:topic_id)

      bookmarks.each do |bookmark|
        bookmark.topic.association(:encrypted_topics_data).target = encrypted_topics_data[bookmark.topic_id]
        bookmark.topic.association(:encrypted_topics_users).target = [encrypted_topics_users[bookmark.topic_id]].compact
      end
    end
  end

  add_to_class(:guardian, :is_user_a_member_of_encrypted_conversation?) do |topic|
    if SiteSetting.encrypt_enabled? && topic && topic.is_encrypted?
      authenticated? && topic.all_allowed_users.where(id: @user.id).exists?
    else
      true
    end
  end

  add_to_class(:guardian, :can_encrypt_post?) do |post|
    SiteSetting.encrypt_enabled? && post.topic.is_encrypted? && post.user == @user
  end

  add_to_class(:guardian, :can_encrypt?) do
    return false if !SiteSetting.encrypt_enabled?
    return false if !authenticated?
    return true if SiteSetting.encrypt_groups.empty?

    encrypt_groups = SiteSetting.encrypt_groups.split('|').map(&:downcase)
    groups = user.groups.pluck(:name).map(&:downcase)

    (groups & encrypt_groups).present?
  end

  # Send plugin-specific data to client via serializers.

  add_to_serializer(:post, :encrypted_raw, false) do
    object.raw
  end

  add_to_serializer(:post, :include_encrypted_raw?) do
    scope&.user.present? && object.topic&.is_encrypted?
  end

  add_to_serializer(:post, :delete_at, false) do
    object.encrypted_post_timer&.delete_at
  end

  add_to_serializer(:post, :include_delete_at?) do
    scope&.user.present? && object.topic&.is_encrypted? && object.encrypted_post_timer&.delete_at.present?
  end

  add_to_serializer(:topic_view, :encrypted_title, false) do
    object.topic.encrypted_topics_data&.title
  end

  add_to_serializer(:topic_view, :include_encrypted_title?) do
    scope&.user.present? && object.topic.is_encrypted?
  end

  add_to_serializer(:topic_view, :topic_key, false) do
    object.topic.encrypted_topics_users.find { |topic_user| topic_user.user_id == scope.user.id }&.key
  end

  add_to_serializer(:topic_view, :include_topic_key?) do
    scope&.user.present? && object.topic.is_encrypted?
  end

  add_to_serializer(:topic_view, :delete_at, false) do
    object.topic.posts.first&.encrypted_post_timer&.delete_at
  end

  add_to_serializer(:topic_view, :include_delete_at?) do
    scope&.user.present? && object.topic.is_encrypted? && object.topic.posts.first&.encrypted_post_timer&.delete_at.present?
  end

  add_to_serializer(:basic_topic, :encrypted_title, false) do
    object.encrypted_topics_data&.title
  end

  add_to_serializer(:basic_topic, :include_encrypted_title?) do
    scope&.user.present? && object.is_encrypted?
  end

  add_to_serializer(:basic_topic, :topic_key, false) do
    object.encrypted_topics_users.find { |topic_user| topic_user.user_id == scope.user.id }&.key
  end

  add_to_serializer(:basic_topic, :include_topic_key?) do
    scope&.user.present? && object.is_encrypted?
  end

  add_to_serializer(:notification, :encrypted_title, false) do
    object.topic.encrypted_topics_data&.title
  end

  add_to_serializer(:notification, :include_encrypted_title?) do
    scope&.user.present? && object&.topic&.is_encrypted?
  end

  add_to_serializer(:notification, :topic_key, false) do
    object.topic.encrypted_topics_users.find { |topic_user| topic_user.user_id == scope.user.id }&.key
  end

  add_to_serializer(:notification, :include_topic_key?) do
    scope&.user.present? && object&.topic&.is_encrypted?
  end

  add_to_serializer(:user_bookmark, :encrypted_title, false) do
    topic.encrypted_topics_data&.title
  end

  add_to_serializer(:user_bookmark, :include_encrypted_title?) do
    scope&.user.present? && topic&.is_encrypted?
  end

  add_to_serializer(:user_bookmark, :topic_key, false) do
    topic.encrypted_topics_users.find { |topic_user| topic_user.user_id == scope.user.id }&.key
  end

  add_to_serializer(:user_bookmark, :include_topic_key?) do
    scope&.user.present? && topic&.is_encrypted?
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
    scope&.user.present? && post.topic&.is_encrypted?
  end

  add_to_serializer(:post_revision, :raws) do
    { previous: previous['raw'], current: current['raw'] }
  end

  add_to_serializer(:post_revision, :include_raws?) do
    scope&.user.present? && post.topic&.is_encrypted?
  end

  add_to_serializer(:current_user, :encrypt_public, false) do
    object.user_encryption_key&.encrypt_public
  end

  add_to_serializer(:current_user, :include_encrypt_public?) do
    scope.can_encrypt?
  end

  add_to_serializer(:current_user, :encrypt_private, false) do
    object.user_encryption_key&.encrypt_private
  end

  add_to_serializer(:current_user, :include_encrypt_private?) do
    scope.can_encrypt?
  end

  add_to_serializer(:current_user, :can_encrypt, false) do
    true
  end

  add_to_serializer(:current_user, :include_can_encrypt?) do
    scope.can_encrypt?
  end

  add_to_serializer(:user, :can_encrypt, false) do
    true
  end

  add_to_serializer(:user, :include_can_encrypt?) do
    scope.can_encrypt?
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
      if timer = (post.encrypted_post_timer || post.topic.posts.first.encrypted_post_timer)
        fragment.inner_html += "<p>#{I18n.t('js.encrypt.encrypted_post_email_timer_annotation', delete_at: I18n.l(timer.delete_at, format: :long))}</p>"
      end
      fragment
    end
  end

  #
  # Handle new post creation.
  #

  add_permitted_post_create_param(:encrypted_title)
  add_permitted_post_create_param(:encrypted_raw)
  add_permitted_post_create_param(:encrypted_keys)
  add_permitted_post_create_param(:delete_after_minutes)

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

      manager.args[:title] = I18n.with_locale(SiteSetting.default_locale) do
        I18n.t('js.encrypt.encrypted_title')
      end
    end

    manager.args[:raw] = manager.args[:encrypted_raw]

    result = manager.perform_create_post
    if result.success?
      if encrypted_keys = manager.args[:encrypted_keys]
        topic_id = result.post.topic_id
        keys = JSON.parse(encrypted_keys).map { |u, k| [u.downcase, k] }.to_h
        user_ids = User.where(username_lower: keys.keys).pluck(:username_lower, :id).to_h
        keys.each { |u, k| EncryptedTopicsUser.create!(topic_id: topic_id, user_id: user_ids[u], key: k) }
      end

      if encrypted_title = manager.args[:encrypted_title]
        EncryptedTopicsData
          .find_or_initialize_by(topic_id: result.post.topic_id)
          .update!(title: encrypted_title)
      end

      if manager.args[:delete_after_minutes].present?
        EncryptedPostTimer.create!(
          post: result.post,
          delete_at: result.post.created_at + manager.args[:delete_after_minutes].to_i.minutes
        )
      end
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

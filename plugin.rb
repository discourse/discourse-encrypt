# frozen_string_literal: true

# name: discourse-encrypt
# about: Provides private, encrypted messaging between end-users.
# meta_topic_id: 107918
# version: 1.0
# authors: Dan Ungureanu
# url: https://github.com/discourse/discourse-encrypt

enabled_site_setting :encrypt_enabled

register_asset "stylesheets/common/encrypt.scss"
register_asset "stylesheets/colors.scss", :color_definitions
%w[
  bars
  exchange-alt
  far-clipboard
  file-export
  file-import
  lock
  plus
  discourse-trash-clock
  ticket-alt
  times
  trash-alt
  unlock
  wrench
].each { |i| register_svg_icon(i) }

Rails.configuration.filter_parameters << :encrypt_private

require_relative "lib/validators/encrypt_enabled_validator.rb"

after_initialize do
  module ::DiscourseEncrypt
    PLUGIN_NAME = "discourse-encrypt"

    def self.safe_csp_src?(value)
      !value.include?("'unsafe-inline'")
    end
  end

  require_relative "app/controllers/encrypt_controller.rb"
  require_relative "app/controllers/encrypted_post_timers_controller.rb"
  require_relative "app/jobs/scheduled/encrypt_consistency.rb"
  require_relative "app/jobs/scheduled/encrypted_post_timer_evaluator.rb"
  require_relative "app/mailers/user_notifications_extensions.rb"
  require_relative "app/models/encrypted_post_timer.rb"
  require_relative "app/models/encrypted_topics_data.rb"
  require_relative "app/models/encrypted_topics_user.rb"
  require_relative "app/models/user_encryption_key.rb"
  require_relative "app/services/problem_check/unsafe_csp.rb"
  require_relative "lib/encrypted_post_creator.rb"
  require_relative "lib/encrypted_search.rb"
  require_relative "lib/grouped_search_result_serializer_extension.rb"
  require_relative "lib/openssl.rb"
  require_relative "lib/post_actions_controller_extensions.rb"
  require_relative "lib/post_extensions.rb"
  require_relative "lib/site_setting_extensions.rb"
  require_relative "lib/site_settings_type_supervisor_extensions.rb"
  require_relative "lib/topic_extensions.rb"
  require_relative "lib/topic_guardian_extensions.rb"
  require_relative "lib/topic_view_serializer_extension.rb"
  require_relative "lib/topics_controller_extensions.rb"
  require_relative "lib/upload_validator_extensions.rb"
  require_relative "lib/user_extensions.rb"
  require_relative "lib/user_notification_renderer_extensions.rb"

  class DiscourseEncrypt::Engine < Rails::Engine
    engine_name DiscourseEncrypt::PLUGIN_NAME
    isolate_namespace DiscourseEncrypt
  end

  DiscourseEncrypt::Engine.routes.draw do
    put "/encrypt/keys" => "encrypt#update_keys"
    delete "/encrypt/keys" => "encrypt#delete_key"
    get "/encrypt/user" => "encrypt#show_user"
    post "/encrypt/reset" => "encrypt#reset_user"
    put "/encrypt/post" => "encrypt#update_post"
    get "/encrypt/stats" => "encrypt#stats"
    get "/encrypt/posts" => "encrypt#posts"
    get "/encrypt/rotate" => "encrypt#show_all_keys"
    put "/encrypt/rotate" => "encrypt#update_all_keys"
    post "/encrypt/encrypted_post_timers" => "encrypted_post_timers#create"
    delete "/encrypt/encrypted_post_timers" => "encrypted_post_timers#destroy"
    get "/encrypt/data_for_decryption" => "encrypt#data_for_decryption"
    post "/encrypt/complete_decryption" => "encrypt#complete_decryption"
    get "/encrypt/list" => "encrypt#list_encrypted_topics"
  end

  Discourse::Application.routes.prepend { mount DiscourseEncrypt::Engine, at: "/" }

  UserUpdater::OPTION_ATTR.push(:encrypt_pms_default)

  reloadable_patch do |plugin|
    GroupedSearchResultSerializer.prepend(DiscourseEncrypt::GroupedSearchResultSerializerExtension)
    Post.prepend(DiscourseEncrypt::PostExtensions)
    PostActionsController.prepend(DiscourseEncrypt::PostActionsControllerExtensions)
    SiteSettings::TypeSupervisor.prepend(DiscourseEncrypt::SiteSettingsTypeSupervisorExtensions)
    Topic.prepend(DiscourseEncrypt::TopicExtensions)
    TopicGuardian.prepend(DiscourseEncrypt::TopicGuardianExtension)
    TopicsController.prepend(DiscourseEncrypt::TopicsControllerExtensions)
    TopicViewSerializer.prepend(DiscourseEncrypt::TopicViewSerializerExtension)
    UploadValidator.prepend(DiscourseEncrypt::UploadValidatorExtensions)
    User.prepend(DiscourseEncrypt::UserExtensions)
    UserNotifications.prepend(DiscourseEncrypt::UserNotificationsExtensions)
    SiteSetting.singleton_class.prepend(DiscourseEncrypt::SiteSettingExtensions)
    UserNotificationRenderer.singleton_class.prepend(
      DiscourseEncrypt::UserNotificationRendererExtensions,
    )
  end

  register_problem_check ProblemCheck::UnsafeCsp

  register_search_topic_eager_load do |opts|
    if SiteSetting.encrypt_enabled? && opts[:search_pms]
      %i[encrypted_topics_users encrypted_topics_data]
    end
  end

  TopicList.on_preload do |topics, topic_list|
    if SiteSetting.encrypt_enabled? && topics.size > 0 && topic_list.current_user
      topic_ids = topics.map(&:id)
      encrypted_topics_data = EncryptedTopicsData.where(topic_id: topic_ids).index_by(&:topic_id)
      encrypted_topics_users =
        EncryptedTopicsUser.where(
          user_id: topic_list.current_user.id,
          topic_id: topic_ids,
        ).index_by(&:topic_id)

      topics.each do |topic|
        topic.association(:encrypted_topics_data).target = encrypted_topics_data[topic.id]
        topic.association(:encrypted_topics_users).target = [
          encrypted_topics_users[topic.id],
        ].compact
      end
    end
  end

  BookmarkQuery.on_preload do |bookmarks, query|
    if SiteSetting.encrypt_enabled? && bookmarks.size > 0
      user_id = bookmarks.first.user_id
      topic_ids =
        Bookmark
          .select_type(bookmarks, "Topic")
          .map(&:bookmarkable_id)
          .concat(Bookmark.select_type(bookmarks, "Post").map { |bm| bm.bookmarkable.topic_id })
          .uniq

      encrypted_topics_data = EncryptedTopicsData.where(topic_id: topic_ids).index_by(&:topic_id)
      encrypted_topics_users =
        EncryptedTopicsUser.where(user_id: user_id, topic_id: topic_ids).index_by(&:topic_id)

      bookmarks.each do |bookmark|
        if bookmark.bookmarkable_type == "Topic"
          bookmark.bookmarkable.association(:encrypted_topics_data).target =
            encrypted_topics_data[bookmark.bookmarkable_id]
          bookmark.bookmarkable.association(:encrypted_topics_users).target = [
            encrypted_topics_users[bookmark.bookmarkable_id],
          ].compact
        elsif bookmark.bookmarkable_type == "Post"
          bookmark.bookmarkable.topic.association(:encrypted_topics_data).target =
            encrypted_topics_data[bookmark.bookmarkable.topic_id]
          bookmark.bookmarkable.topic.association(:encrypted_topics_users).target = [
            encrypted_topics_users[bookmark.bookmarkable.topic_id],
          ].compact
        end
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

    encrypt_groups = SiteSetting.encrypt_groups.split("|").map(&:downcase)
    groups = user.groups.pluck(:name).map(&:downcase)

    (groups & encrypt_groups).present?
  end

  # Send plugin-specific data to client via serializers.

  add_to_serializer(
    :post,
    :encrypted_raw,
    include_condition: -> { scope&.user.present? && object.topic&.is_encrypted? },
  ) { object.raw }

  add_to_serializer(
    :post,
    :delete_at,
    include_condition: -> do
      scope&.user.present? && object.topic&.is_encrypted? &&
        object.encrypted_post_timer&.delete_at.present?
    end,
  ) { object.encrypted_post_timer&.delete_at }

  add_to_serializer(
    :topic_view,
    :encrypted_title,
    include_condition: -> { scope&.user.present? && object.topic.is_encrypted? },
  ) { object.topic.encrypted_topics_data&.title }

  add_to_serializer(
    :topic_view,
    :topic_key,
    include_condition: -> { scope&.user.present? && object.topic.is_encrypted? },
  ) do
    object
      .topic
      .encrypted_topics_users
      .find { |topic_user| topic_user.user_id == scope.user.id }
      &.key
  end

  add_to_serializer(
    :topic_view,
    :delete_at,
    include_condition: -> do
      scope&.user.present? && object.topic.is_encrypted? &&
        object.topic.posts.first&.encrypted_post_timer&.delete_at.present?
    end,
  ) { object.topic.posts.first&.encrypted_post_timer&.delete_at }

  add_to_serializer(
    :basic_topic,
    :encrypted_title,
    include_condition: -> { scope&.user.present? && object.is_encrypted? },
  ) { object.encrypted_topics_data&.title }

  add_to_serializer(
    :basic_topic,
    :topic_key,
    include_condition: -> { scope&.user.present? && object.is_encrypted? },
  ) { object.encrypted_topics_users.find { |topic_user| topic_user.user_id == scope.user.id }&.key }

  add_to_serializer(
    :notification,
    :encrypted_title,
    include_condition: -> { scope&.user.present? && object&.topic&.is_encrypted? },
  ) { object.topic.encrypted_topics_data&.title }

  add_to_serializer(
    :notification,
    :topic_key,
    include_condition: -> { scope&.user.present? && object&.topic&.is_encrypted? },
  ) do
    object
      .topic
      .encrypted_topics_users
      .find { |topic_user| topic_user.user_id == scope.user.id }
      &.key
  end

  # UserBookmarkBaseSerializer
  add_to_class(:user_bookmark_base_serializer, :bookmark_topic) do
    @bookmark_topic ||= bookmarkable_type == "Topic" ? bookmarkable : bookmarkable.topic
  end

  add_to_class(:user_bookmark_base_serializer, :can_have_encryption_data?) do
    %w[Post Topic].include?(bookmarkable_type)
  end

  add_to_serializer(
    :user_bookmark_base,
    :encrypted_title,
    include_condition: -> do
      return false if !can_have_encryption_data?
      scope&.user.present? && bookmark_topic&.is_encrypted?
    end,
  ) { bookmark_topic.encrypted_topics_data&.title }

  add_to_serializer(
    :user_bookmark_base,
    :topic_key,
    include_condition: -> do
      return false if !can_have_encryption_data?
      scope&.user.present? && bookmark_topic&.is_encrypted?
    end,
  ) do
    bookmark_topic
      .encrypted_topics_users
      .find { |topic_user| topic_user.user_id == scope.user.id }
      &.key
  end

  # +topic_id+ and +raws+
  #
  # Topic's ID and previous and current raw values for encrypted topics.
  #
  # These values are required by `Post.loadRevision` to decrypt the
  # ciphertexts and perform client-sided diff.

  add_to_serializer(
    :post_revision,
    :topic_id,
    include_condition: -> { scope&.user.present? && post.topic&.is_encrypted? },
  ) { post.topic_id }

  add_to_serializer(
    :post_revision,
    :raws,
    include_condition: -> { scope&.user.present? && post.topic&.is_encrypted? },
  ) { { previous: previous["raw"], current: current["raw"] } }

  add_to_serializer(:current_user, :encrypt_public, include_condition: -> { scope.can_encrypt? }) do
    object.user_encryption_key&.encrypt_public
  end

  add_to_serializer(
    :current_user,
    :encrypt_private,
    include_condition: -> { scope.can_encrypt? },
  ) { object.user_encryption_key&.encrypt_private }

  add_to_serializer(:current_user, :can_encrypt, include_condition: -> { scope.can_encrypt? }) do
    true
  end

  add_to_serializer(
    :current_user,
    :encrypt_pms_default,
    include_condition: -> { scope.can_encrypt? },
  ) { object.user_option.encrypt_pms_default || SiteSetting.encrypt_pms_default }

  add_to_serializer(:user, :can_encrypt, include_condition: -> { scope.can_encrypt? }) { true }

  add_to_serializer(:user_option, :encrypt_pms_default) do
    object.encrypt_pms_default || SiteSetting.encrypt_pms_default
  end

  add_model_callback(:user_option, :before_create) do
    self.encrypt_pms_default = SiteSetting.encrypt_pms_default if SiteSetting.encrypt_enabled
  end

  #
  # Hide cooked content.
  #

  Plugin::Filter.register(:after_post_cook) do |post, cooked|
    post.is_encrypted? ? cooked.gsub!(post.ciphertext, I18n.t("js.encrypt.encrypted_post")) : cooked
  end

  on(:post_process_cooked) do |doc, post|
    if post&.is_encrypted?
      doc.inner_html.gsub!(post.ciphertext, I18n.t("js.encrypt.encrypted_post"))
    end
  end

  # Notifications
  on(:reduce_excerpt) do |doc, options|
    if options[:post]&.is_encrypted?
      doc.inner_html = "<p>#{I18n.t("js.encrypt.encrypted_post_email")}</p>"
    end
  end

  # Email
  on(:reduce_cooked) do |fragment, post|
    if post&.is_encrypted?
      fragment.inner_html = "<p>#{I18n.t("js.encrypt.encrypted_post_email")}</p>"
      if timer = (post.encrypted_post_timer || post.topic.posts.first.encrypted_post_timer)
        fragment.inner_html +=
          "<p>#{I18n.t("js.encrypt.encrypted_post_email_timer_annotation", delete_at: I18n.l(timer.delete_at, format: :long))}</p>"
      end
      fragment
    end
  end

  # Don't send encrypted posts attachments via email.
  register_modifier(:should_add_email_attachments) { |post| !post&.is_encrypted? }

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
        result.errors.add(
          :base,
          I18n.t("activerecord.errors.models.topic.attributes.base.no_user_selected"),
        )
        next result
      end

      if !manager.args[:encrypted_keys]
        result = NewPostResult.new(:created_post, false)
        result.errors.add(:base, I18n.t("encrypt.no_encrypt_keys"))
        next result
      end

      manager.args[:title] = I18n.with_locale(SiteSetting.default_locale) do
        I18n.t("js.encrypt.encrypted_title")
      end
    end

    manager.args[:raw] = manager.args[:encrypted_raw]

    result = manager.perform_create_post
    if result.success?
      if encrypted_keys = manager.args[:encrypted_keys]
        topic_id = result.post.topic_id
        keys = JSON.parse(encrypted_keys).map { |u, k| [u.downcase, k] }.to_h
        user_ids = User.where(username_lower: keys.keys).pluck(:username_lower, :id).to_h
        keys.each do |u, k|
          EncryptedTopicsUser.create!(topic_id: topic_id, user_id: user_ids[u], key: k)
        end
      end

      if encrypted_title = manager.args[:encrypted_title]
        EncryptedTopicsData.find_or_initialize_by(topic_id: result.post.topic_id).update!(
          title: encrypted_title,
        )
      end

      if manager.args[:delete_after_minutes].present?
        EncryptedPostTimer.create!(
          post: result.post,
          delete_at: result.post.created_at + manager.args[:delete_after_minutes].to_i.minutes,
        )
      end
    end

    result
  end

  # Delete TopicAllowedUser records for users who do not have the key
  on(:post_created) do |post, opts, user|
    if post.post_number > 1 && post.topic&.is_encrypted? &&
         !EncryptedTopicsUser.find_by(topic_id: post.topic_id, user_id: user.id)&.key
      TopicAllowedUser.where(user_id: user.id, topic_id: post.topic_id).delete_all
    end
  end
end

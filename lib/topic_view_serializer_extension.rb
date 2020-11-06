# frozen_string_literal: true

module TopicViewSerializerExtension
  def posts
    if SiteSetting.encrypt_enabled?
      posts = object.posts.includes(:encrypted_post_timer)
      object.instance_variable_set(:@posts, posts)
    end
    super
  end
end

# frozen_string_literal: true

module GuardianExtensions
  def can_see_topic?(topic, hide_deleted = true)
    if SiteSetting.encrypt_enabled? && topic.private_message? && topic.is_encrypted?
      authenticated? && topic.all_allowed_users.where(id: @user.id).exists?
    else
      true
    end && super
  end

  def can_see_post?(post)
    can_see_topic?(post.topic) && super
  end
end

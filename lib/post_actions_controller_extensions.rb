# frozen_string_literal: true

module DiscourseEncrypt::PostActionsControllerExtensions
  def create
    if SiteSetting.encrypt_enabled?
      raise Discourse::NotFound if @post.blank?
      raise Discourse::InvalidAccess if !guardian.is_user_a_member_of_encrypted_conversation?(@post.topic)
    end
    super
  end
end

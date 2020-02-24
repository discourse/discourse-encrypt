# frozen_string_literal: true

module TopicExtensions
  def is_encrypted?
    !!(private_message? && encrypted_topics_title&.title)
  end

  def remove_allowed_user(removed_by, user)
    ret = super
    DiscourseEncrypt::del_key(id, user.id) if ret
    ret
  end
end

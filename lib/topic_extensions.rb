# frozen_string_literal: true

module TopicExtensions
  def self.prepended(base)
    base.has_one :encrypted_topics_data
  end

  def is_encrypted?
    !!(private_message? && encrypted_topics_data&.title)
  end

  def remove_allowed_user(removed_by, user)
    ret = super
    DiscourseEncrypt::del_key(id, user.id) if ret
    ret
  end
end

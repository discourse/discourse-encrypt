# frozen_string_literal: true

module TopicExtensions
  def self.prepended(base)
    base.has_one :encrypted_topics_data
    base.has_many :encrypted_topics_users
  end

  def is_encrypted?
    !!(private_message? && encrypted_topics_data&.title)
  end

  def remove_allowed_user(removed_by, user)
    ret = super
    EncryptedTopicsUser.delete_by(topic_id: id, user_id: user.id) if ret
    ret
  end
end

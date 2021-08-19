# frozen_string_literal: true

module DiscourseEncrypt::TopicGuardianExtension
  def can_convert_topic?(topic)
    super && !topic.is_encrypted?
  end
end

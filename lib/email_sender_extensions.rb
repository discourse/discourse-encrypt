# frozen_string_literal: true

module DiscourseEncrypt::EmailSenderExtensions
  def add_attachments(*posts)
    return if posts.any?(&:is_encrypted?)
    super
  end
end

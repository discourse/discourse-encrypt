# frozen_string_literal: true

module DiscourseEncrypt::EmailSenderExtensions
  def add_attachments(post)
    return if post.is_encrypted?
    super
  end
end

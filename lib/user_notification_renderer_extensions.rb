# frozen_string_literal: true

module DiscourseEncrypt::UserNotificationRendererExtensions
  def render(*args)
    post = args[0]&.dig(:locals, :post)
    args[0][:locals][:in_reply_to_post] = nil if post&.is_encrypted?
    super(*args)
  end
end

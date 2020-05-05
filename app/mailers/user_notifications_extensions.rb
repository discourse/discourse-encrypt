# frozen_string_literal: true

module UserNotificationsExtensions
  def notification_email(user, opts)
    opts[:allow_reply_by_email] = false if opts[:post] && opts[:post].is_encrypted?
    super
  end
end

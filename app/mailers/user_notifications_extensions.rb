# frozen_string_literal: true

module UserNotificationsExtensions
  def notification_email(user, opts)
    if opts[:post] && opts[:post].is_encrypted?
      opts[:allow_reply_by_email] = false
      opts[:notification_data_hash][:topic_title] = "#{opts[:post].topic.title} ##{opts[:post].topic.id}"
    end
    super
  end
end

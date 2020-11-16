# frozen_string_literal: true

module Jobs
  class EncryptedPostTimerEvaluator < ::Jobs::Scheduled
    every 1.minute

    def execute(args)
      EncryptedPostTimer.pending.order(delete_at: :asc).find_each do |encrypted_post_timer|
        ActiveRecord::Base.transaction do
          encrypted_post_timer.touch(:destroyed_at)
          next if !encrypted_post_timer.post&.persisted?
          posts_to_delete(encrypted_post_timer).each do |post|
            next if !post&.persisted?
            PostDestroyer.new(post.user, post, permanent: true).destroy
          end
        end
      end
    end

    def posts_to_delete(encrypted_post_timer)
      encrypted_post_timer.post.is_first_post? ? encrypted_post_timer.post.topic.posts.with_deleted.order(created_at: :desc) : [encrypted_post_timer.post]
    end
  end
end

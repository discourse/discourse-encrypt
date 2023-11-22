# frozen_string_literal: true

module Jobs
  class EncryptedPostTimerEvaluator < ::Jobs::Scheduled
    every 1.minute

    def execute(args)
      EncryptedPostTimer.pending.find_each do |encrypted_post_timer|
        ActiveRecord::Base.transaction do
          encrypted_post_timer.touch(:destroyed_at)

          timer_post = Post.with_deleted.find_by(id: encrypted_post_timer.post_id)
          next if !timer_post

          timer_topic = Topic.with_deleted.find_by(id: timer_post.topic_id)
          next if !timer_topic

          posts_to_delete = find_posts_to_delete(timer_topic, timer_post)
          next if posts_to_delete.blank?

          timer_topic.update_columns(deleted_at: nil)

          posts_to_delete.each do |post|
            next if !post&.persisted?
            PostDestroyer.new(
              post.user || Discourse.system_user,
              post,
              permanent: true,
              force_destroy: true,
            ).destroy
          end
        end
      end
    end

    private

    def find_posts_to_delete(topic, post)
      (post.is_first_post? ? topic.posts.with_deleted.order(created_at: :desc) : [post]).compact
    end
  end
end

# frozen_string_literal: true

module Jobs
  class EncryptedPostTimerEvaluator < ::Jobs::Scheduled
    every 1.minute

    def execute(args)
      EncryptedPostTimer.pending.find_each do |encrypted_post_timer|
        ActiveRecord::Base.transaction do
          encrypted_post_timer.touch(:destroyed_at)
          posts_to_delete = posts_to_delete(encrypted_post_timer)
          next if posts_to_delete.blank?
          next unless @topic
          @topic.update_columns(deleted_at: nil)
          posts_to_delete.each do |post|
            next if !post&.persisted?
            PostDestroyer.new(post.user, post, permanent: true).destroy
          end
        end
      end
    end

    def posts_to_delete(encrypted_post_timer)
      post = Post.with_deleted.find_by(id: encrypted_post_timer.post_id)
      return [] unless post
      @topic = Topic.with_deleted.find_by(id: post.topic_id)
      posts_to_delete = post&.is_first_post? ? @topic.posts.with_deleted.order(created_at: :desc) : [post]
      posts_to_delete.compact
    end
  end
end

# frozen_string_literal: true

module Jobs
  class EncryptedTimeBombDetonator < ::Jobs::Scheduled
    every 1.minute

    def self.execute(args)
      EncryptedTimeBomb.pending.find_each do |encrypted_time_bomb|
        ActiveRecord::Base.transaction do
          encrypted_time_bomb.touch(:exploded_at)
          posts_to_delete(encrypted_time_bomb).each do |post|
            next if !post.persisted?
            PostDestroyer.new(post.user, post, permanent: true).destroy
          end
        end
      end
    end

    def self.posts_to_delete(encrypted_time_bomb)
      encrypted_time_bomb.post.is_first_post? ? encrypted_time_bomb.post.topic.posts : [encrypted_time_bomb.post]
    end
  end
end

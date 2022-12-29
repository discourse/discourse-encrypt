# frozen_string_literal: true

class DiscourseEncrypt::EncryptedPostTimersController < ApplicationController
  requires_plugin DiscourseEncrypt::PLUGIN_NAME

  before_action :ensure_logged_in
  before_action :ensure_can_encrypt

  def create
    delete_at = 1.minutes.from_now
    Array.wrap(params[:post_id]).each { |post_id| create_for_post(post_id, delete_at) }
    render json: { delete_at: delete_at }
  end

  def destroy
    post = Post.with_deleted.find(params[:post_id])
    encrypted_post_timer = EncryptedPostTimer.find_by(post: post)
    return unless encrypted_post_timer
    if post.is_first_post?
      topic = Topic.with_deleted.find(post.topic_id)
      guardian.ensure_can_recover_topic!(topic)
    else
      guardian.ensure_can_recover_post!(post)
    end
    encrypted_post_timer.destroy!
  end

  private

  def create_for_post(post_id, delete_at)
    post = Post.find(post_id)
    return unless post.is_encrypted?
    guardian.ensure_can_delete!(post.is_first_post? ? post.topic : post)

    EncryptedPostTimer.create!(post: post, delete_at: delete_at)
  end

  def ensure_can_encrypt
    current_user.guardian.ensure_can_encrypt!
  end
end

# frozen_string_literal: true

require "rails_helper"

describe DiscourseEncrypt::EncryptedPostTimersController do
  let!(:user) { Fabricate(:encrypt_user, admin: true) }
  let!(:user2) { Fabricate(:encrypt_user) }
  let!(:topic) do
    Fabricate(
      :encrypt_topic,
      user: user,
      topic_allowed_users: [Fabricate.build(:topic_allowed_user, user: user)],
    )
  end
  let!(:encrypt_post) { Fabricate(:encrypt_post, topic: topic) }

  it "creates and deletes timer if user has access to private message" do
    sign_in(user2)
    post "/encrypt/encrypted_post_timers.json", params: { post_id: topic.posts.first.id }
    expect(response.status).to eq(403)
    expect(EncryptedPostTimer.count).to eq(0)

    sign_in(user)
    post "/encrypt/encrypted_post_timers.json", params: { post_id: topic.posts.first.id }
    expect(response).to be_successful
    expect(EncryptedPostTimer.count).to eq(1)

    topic.update(deleted_at: Time.now)
    sign_in(user2)
    delete "/encrypt/encrypted_post_timers.json", params: { post_id: topic.posts.first.id }
    expect(response.status).to eq(403)
    expect(EncryptedPostTimer.count).to eq(1)

    sign_in(user)
    delete "/encrypt/encrypted_post_timers.json", params: { post_id: topic.posts.first.id }
    expect(response).to be_successful
    expect(EncryptedPostTimer.count).to eq(0)
  end
end

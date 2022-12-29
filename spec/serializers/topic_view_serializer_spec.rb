# frozen_string_literal: true

require "rails_helper"

describe TopicViewSerializer do
  let(:user) { Fabricate(:user) }

  let(:encrypt_topic) do
    Fabricate(
      :encrypt_topic,
      topic_allowed_users: [Fabricate.build(:topic_allowed_user, user: user)],
    )
  end
  let(:encrypt_post) { Fabricate(:encrypt_post, topic: encrypt_topic) }
  let(:topic) do
    Fabricate(
      :private_message_topic,
      topic_allowed_users: [Fabricate.build(:topic_allowed_user, user: user)],
    )
  end

  let(:encrypt_topic_view) { TopicView.new(encrypt_topic.id, user) }
  let(:topic_view) { TopicView.new(topic.id, user) }

  it "contains encrypted fields only for encrypted topics" do
    EncryptedPostTimer.create!(post: encrypt_post, delete_at: 1.hour.from_now)

    serialized =
      described_class.new(encrypt_topic_view, scope: Guardian.new(user), root: false).as_json
    expect(serialized[:encrypted_title]).not_to eq(nil)
    expect(serialized[:topic_key]).not_to eq(nil)
    expect(serialized[:delete_at]).not_to eq(nil)

    serialized = described_class.new(topic_view, scope: Guardian.new(user), root: false).as_json
    expect(serialized[:encrypted_title]).to eq(nil)
    expect(serialized[:topic_key]).to eq(nil)
    expect(serialized[:delete_at]).to eq(nil)

    serialized = described_class.new(encrypt_topic_view, scope: Guardian.new, root: false).as_json
    expect(serialized[:encrypted_title]).to eq(nil)
    expect(serialized[:topic_key]).to eq(nil)
    expect(serialized[:delete_at]).to eq(nil)
  end
end

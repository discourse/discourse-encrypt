# frozen_string_literal: true

require "rails_helper"

describe Jobs::EncryptConsistency do
  subject(:job) { described_class.new }

  fab!(:topic) { Fabricate(:encrypt_topic) }
  fab!(:user_without_invite) { Fabricate(:user) }
  fab!(:user_without_key) { Fabricate(:user) }

  before do
    EncryptedTopicsUser.create!(
      topic_id: topic.id,
      user_id: user_without_invite.id,
      key: "topic key",
    )
    TopicAllowedUser.create(topic_id: topic.id, user_id: user_without_key.id)
  end

  it "ensures invites and topic keys are consistent" do
    expect { job.execute({}) }.to change {
      TopicAllowedUser.exists?(topic: topic, user: user_without_invite)
    }.from(false).to(true).and change {
            TopicAllowedUser.exists?(topic: topic, user: user_without_key)
          }.from(true).to(false)
  end
end

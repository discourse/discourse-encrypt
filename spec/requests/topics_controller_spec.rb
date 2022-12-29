# frozen_string_literal: true

require "rails_helper"

describe TopicsController do
  let(:topic) { Fabricate(:encrypt_topic) }
  let(:user) { Fabricate(:user) }
  let(:group) { Fabricate(:group) }
  let(:admin) { Fabricate(:admin) }
  let(:admin2) { Fabricate(:admin) }

  before do
    TopicAllowedUser.create!(user_id: admin.id, topic_id: topic.id)
    sign_in(admin)
  end

  describe "#update" do
    it "updates encrypted title" do
      put "/t/#{topic.slug}/#{topic.id}.json", params: { encrypted_title: "new encrypted title" }

      expect(response.status).to eq(200)
      expect(topic.reload.encrypted_topics_data.title).to eq("new encrypted title")
    end

    it "returns invalid access for deleted topic" do
      topic.destroy!
      put "/t/#{topic.slug}/#{topic.id}.json", params: { encrypted_title: "new encrypted title" }
      expect(response.status).to eq(403)
    end
  end

  it "not invited admin does not have access" do
    sign_in(admin2)
    get "/t/#{topic.slug}/#{topic.id}.json"
    expect(response.status).to eq(403)

    TopicAllowedUser.create!(user_id: admin2.id, topic_id: topic.id)
    get "/t/#{topic.slug}/#{topic.id}.json"
    expect(response.status).to eq(200)
  end

  describe "#invite" do
    it "saves user key" do
      post "/t/#{topic.id}/invite.json", params: { user: user.username, key: "key of user" }

      expect(response.status).to eq(200)
      expect(TopicAllowedUser.where(user_id: user.id, topic_id: topic.id).exists?).to eq(true)
      expect(EncryptedTopicsUser.find_by(topic_id: topic.id, user_id: user.id).key).to eq(
        "key of user",
      )
    end

    it "returns an error with no key" do
      post "/t/#{topic.id}/invite.json", params: { user: user.username }

      expect(response.status).to eq(422)
      expect(TopicAllowedUser.where(user_id: user.id, topic_id: topic.id).exists?).to eq(false)
      expect(EncryptedTopicsUser.where(topic_id: topic.id, user_id: user.id).exists?).to eq(false)
    end
  end

  describe "#invite_group" do
    it "returns an error with no key" do
      post "/t/#{topic.id}/invite-group.json", params: { group: group.name }

      expect(response.status).to eq(422)
      expect(TopicAllowedGroup.where(group_id: group.id, topic_id: topic.id).exists?).to eq(false)
    end
  end

  describe "#remove_allowed_user" do
    let(:topic) { Fabricate(:encrypt_topic, user: user) }
    let(:other_user) { topic.topic_allowed_users.map(&:user).find { |u| u != user } }

    it "uninvites the user" do
      put "/t/#{topic.id}/remove-allowed-user.json", params: { username: other_user.username }

      expect(EncryptedTopicsUser.where(topic_id: topic.id, user_id: user.id).exists?).to eq(true)
      expect(EncryptedTopicsUser.where(topic_id: topic.id, user_id: other_user.id).exists?).to eq(
        false,
      )
    end
  end
end

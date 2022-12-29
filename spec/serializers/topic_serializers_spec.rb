# frozen_string_literal: true

require "rails_helper"

[BasicTopicSerializer, ListableTopicSerializer, TopicListItemSerializer].each do |klass|
  describe klass do
    let(:user) { Fabricate(:user) }

    let(:encrypt_topic) do
      Fabricate(
        :encrypt_topic,
        topic_allowed_users: [Fabricate.build(:topic_allowed_user, user: user)],
      )
    end
    let(:topic) do
      Fabricate(
        :private_message_topic,
        topic_allowed_users: [Fabricate.build(:topic_allowed_user, user: user)],
      )
    end

    it "contains encrypted fields only for encrypted topics" do
      serialized =
        described_class.new(encrypt_topic, scope: Guardian.new(user), root: false).as_json
      expect(serialized[:encrypted_title]).not_to eq(nil)
      expect(serialized[:topic_key]).not_to eq(nil)

      serialized = described_class.new(topic, scope: Guardian.new(user), root: false).as_json
      expect(serialized[:encrypted_title]).to eq(nil)
      expect(serialized[:topic_key]).to eq(nil)

      serialized = described_class.new(encrypt_topic, scope: Guardian.new, root: false).as_json
      expect(serialized[:encrypted_title]).to eq(nil)
      expect(serialized[:topic_key]).to eq(nil)
    end
  end
end

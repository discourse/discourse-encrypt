# frozen_string_literal: true

require 'rails_helper'

describe TopicsController do

  let(:store) { PluginStore.new('discourse-encrypt') }

  let(:user)  { Fabricate(:user) }
  let(:user2) { Fabricate(:user) }
  let(:user3) { Fabricate(:user) }

  let(:topic) {
    topic = Fabricate(:private_message_topic)
    topic.custom_fields['encrypted_title'] = '-- the encrypted title --'
    topic.save_custom_fields

    Fabricate(:topic_allowed_user, topic: topic, user: user)
    Fabricate(:topic_allowed_user, topic: topic, user: user2)

    topic
  }

  before do
    sign_in(Fabricate(:admin))
  end

  context '#update' do
    it 'updates encrypted title' do
      put "/t/#{topic.slug}/#{topic.id}.json", params: { encrypted_title: 'new encrypted title' }

      expect(response.status).to eq(200)
      expect(topic.reload.custom_fields['encrypted_title']).to eq('new encrypted title')
    end
  end

  context '#invite' do
    it 'saves user key' do
      post "/t/#{topic.id}/invite.json", params: { user: user3.username, key: 'key of user3' }

      expect(response.status).to eq(200)
      expect(TopicAllowedUser.where(user_id: user3.id, topic_id: topic.id).exists?).to eq(true)
      expect(PluginStoreRow.find_by(key: "key_#{topic.id}_#{user3.id}").value).to eq('key of user3')
    end
  end

  context '#remove_allowed_user' do
    it 'removes user key' do
      put "/t/#{topic.id}/remove-allowed-user.json", params: { username: user2.username }

      expect(response.status).to eq(200)
      expect(TopicAllowedUser.where(user_id: user2.id, topic_id: topic.id).exists?).to eq(false)
      expect(PluginStoreRow.find_by(key: "key_#{topic.id}_#{user2.id}")).to eq(nil)
    end
  end
end

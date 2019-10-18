# frozen_string_literal: true

require 'rails_helper'

describe Topic do
  let(:topic) { Fabricate(:topic) }
  let(:encrypt_post) { Fabricate(:encrypt_post) }
  let!(:encrypt_topic) { encrypt_post.topic }

  context '#is_encrypted?' do
    it 'works' do
      expect(topic.is_encrypted?).to eq(false)
      expect(encrypt_topic.is_encrypted?).to eq(true)
    end
  end

  context 'remove_allowed_user' do
    it 'deletes topic key for user' do
      expect { encrypt_topic.remove_allowed_user(Discourse.system_user, encrypt_topic.user) }
        .to change { TopicAllowedUser.count }.by(-1)
        .and change { PluginStoreRow.count }.by(-1)
      expect(DiscourseEncrypt::Store.get("key_#{encrypt_topic.id}_#{encrypt_topic.user_id}")).to eq(nil)
    end
  end
end

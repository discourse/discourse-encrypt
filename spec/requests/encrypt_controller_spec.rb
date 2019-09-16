# frozen_string_literal: true

require 'rails_helper'

describe ::DiscourseEncrypt::EncryptController do

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

  let(:other_topic) { Fabricate(:topic) }

  before do
    store.set("key_#{topic.id}_#{user.id}", '-- the key of user --')
    store.set("key_#{topic.id}_#{user2.id}", '-- the key of user2 --')
  end

  context '#update_keys' do
    it 'does not work when not logged in' do
      put '/encrypt/keys', params: {
        public: '-- the public key --',
        private: '-- the private key --'
      }

      expect(response.status).to eq(403)
    end

    it 'does not work when user is not allowed' do
      group = Fabricate(:group)
      SiteSetting.encrypt_groups = group.name

      user = Fabricate(:user)
      sign_in(user)

      put '/encrypt/keys', params: {
        public: '-- the public key --',
        private: '-- the private key --'
      }
      expect(response.status).to eq(403)

      Fabricate(:group_user, group: group, user: user)

      put '/encrypt/keys', params: {
        public: '-- the public key --',
        private: '-- the private key --'
      }
      expect(response.status).to eq(200)
    end

    it 'saves user keys' do
      sign_in(user3)

      put '/encrypt/keys', params: {
        public: '-- the public key --',
        private: '-- the private key --'
      }

      expect(response.status).to eq(200)
      expect(user3.custom_fields['encrypt_public']).to eq('-- the public key --')
      expect(user3.custom_fields['encrypt_private']).to eq('-- the private key --')
    end

    it 'updates user keys' do
      sign_in(user)

      put '/encrypt/keys', params: {
        public: '-- the public key --',
        private: '-- the new private key --'
      }

      user.reload

      expect(response.status).to eq(200)
      expect(user.custom_fields['encrypt_public']).to eq('-- the public key --')
      expect(user.custom_fields['encrypt_private']).to eq('-- the new private key --')
    end

    it 'does not allow updating if wrong public key' do
      user.custom_fields['encrypt_public'] = '-- the public key --'
      user.custom_fields['encrypt_private'] = '-- the private key --'
      user.save!
      sign_in(user)

      put '/encrypt/keys', params: {
        public: '-- a wrong public key --',
        private: '-- the new private key --'
      }

      expect(response.status).to eq(409)
      expect(user.custom_fields['encrypt_public']).to eq('-- the public key --')
      expect(user.custom_fields['encrypt_private']).to eq('-- the private key --')
    end
  end

  context '#show_user' do
    it 'does not work when not logged in' do
      get '/encrypt/user', params: { usernames: [ user.username, user2.username, user3.username ] }
      expect(response.status).to eq(404)
    end

    it 'gets the right user keys' do
      user.custom_fields['encrypt_public'] = '-- the public key --'
      user.save!
      user2.custom_fields['encrypt_public'] = '-- another public key --'
      user2.save
      sign_in(user)

      get '/encrypt/user', params: { usernames: [ user.username, user2.username, user3.username ] }

      expect(response.status).to eq(200)
      json = ::JSON.parse(response.body)
      expect(json.size).to eq(3)
      expect(json[user.username]).to eq('-- the public key --')
      expect(json[user2.username]).to eq('-- another public key --')
      expect(json[user3.username]).to eq(nil)
    end
  end

  context '#reset_user' do
    before do
      user.custom_fields['encrypt_public']  = '-- the public key --'
      user.custom_fields['encrypt_private'] = '-- the private key --'
      user.save_custom_fields

      store.set("key_#{topic.id}_#{user.id}", '-- user key --')

      sign_in(user)
    end

    it 'resets everything' do
      expect { post '/encrypt/reset', params: { user_id: user.id, everything: true } }
        .to change { TopicAllowedUser.count }.by(-1)
        .and change { PluginStoreRow.count }.by(-1)
        .and change { UserCustomField.count }.by(-2)

      expect(response.status).to eq(200)
    end

    it 'resets only keys' do
      expect { post '/encrypt/reset', params: { user_id: user.id } }
        .to change { TopicAllowedUser.count }.by(0)
        .and change { PluginStoreRow.count }.by(0)
        .and change { UserCustomField.count }.by(-2)

      expect(response.status).to eq(200)
    end
  end
end

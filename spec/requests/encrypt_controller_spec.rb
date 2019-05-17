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
        public_key: '-- the public key --',
        private_key: '-- the private key --',
        salt: '-- the salt --'
      }

      expect(response.status).to eq(403)
    end

    it 'does not work when user is not allowed' do
      group = Fabricate(:group)
      SiteSetting.encrypt_groups = group.name

      user = Fabricate(:user)
      sign_in(user)

      put '/encrypt/keys', params: {
        public_key: '-- the public key --',
        private_key: '-- the private key --',
        salt: '-- the salt --'
      }
      expect(response.status).to eq(403)

      Fabricate(:group_user, group: group, user: user)

      put '/encrypt/keys', params: {
        public_key: '-- the public key --',
        private_key: '-- the private key --',
        salt: '-- the salt --'
      }
      expect(response.status).to eq(200)
    end

    it 'saves user keys' do
      sign_in(user3)

      put '/encrypt/keys', params: {
        public_key: '-- the public key --',
        private_key: '-- the private key --',
        salt: '-- the salt --'
      }

      expect(response.status).to eq(200)
      expect(user3.custom_fields['encrypt_public_key']).to eq('-- the public key --')
      expect(user3.custom_fields['encrypt_private_key']).to eq('-- the private key --')
      expect(user3.custom_fields['encrypt_salt']).to eq('-- the salt --')
    end

    it 'updates user keys' do
      sign_in(user)

      put '/encrypt/keys', params: {
        public_key: '-- the public key --',
        private_key: '-- the new private key --',
        salt: '-- the new salt --'
      }

      user.reload

      expect(response.status).to eq(200)
      expect(user.custom_fields['encrypt_public_key']).to eq('-- the public key --')
      expect(user.custom_fields['encrypt_private_key']).to eq('-- the new private key --')
      expect(user.custom_fields['encrypt_salt']).to eq('-- the new salt --')
    end

    it 'does not allow updating if wrong public key' do
      user.custom_fields['encrypt_public_key'] = '-- the public key --'
      user.custom_fields['encrypt_private_key'] = '-- the private key --'
      user.custom_fields['encrypt_salt'] = '-- the salt --'
      user.save!
      sign_in(user)

      put '/encrypt/keys', params: {
        public_key: '-- a wrong public key --',
        private_key: '-- the new private key --',
        salt: '-- the new salt --'
      }

      expect(response.status).to eq(409)
      expect(user.custom_fields['encrypt_public_key']).to eq('-- the public key --')
      expect(user.custom_fields['encrypt_private_key']).to eq('-- the private key --')
      expect(user.custom_fields['encrypt_salt']).to eq('-- the salt --')
    end
  end

  context '#show_user' do
    it 'does not work when not logged in' do
      get '/encrypt/user', params: { usernames: [ user.username, user2.username, user3.username ] }
      expect(response.status).to eq(404)
    end

    it 'gets the right user keys' do
      user.custom_fields['encrypt_public_key'] = '-- the public key --'
      user.save!
      user2.custom_fields['encrypt_public_key'] = '-- another public key --'
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

  context '#update_topic' do
    it 'does not work when not logged in' do
      put '/encrypt/topic', params: {
        topic_id: topic.id,
        title: '-- other encrypted title --',
        keys: {
          user.username => '-- other key of user --',
          user2.username => '-- other key of user2 --'
        }
      }

      expect(response.status).to eq(403)
      expect(topic.custom_fields['encrypted_title']).to eq('-- the encrypted title --')
      expect(store.get("key_#{topic.id}_#{user.id}")).to eq('-- the key of user --')
      expect(store.get("key_#{topic.id}_#{user2.id}")).to eq('-- the key of user2 --')
    end

    it 'does not work for users who cannot see topic' do
      sign_in(user3)

      put '/encrypt/topic', params: {
        topic_id: topic.id,
        title: '-- other encrypted title --',
        keys: {
          user.username => '-- other key of user --',
          user2.username => '-- other key of user2 --'
        }
      }

      expect(response.status).to eq(403)
      expect(topic.custom_fields['encrypted_title']).to eq('-- the encrypted title --')
      expect(store.get("key_#{topic.id}_#{user.id}")).to eq('-- the key of user --')
      expect(store.get("key_#{topic.id}_#{user2.id}")).to eq('-- the key of user2 --')
    end

    it 'saves encrypted topic data' do
      sign_in(user)

      put '/encrypt/topic', params: {
        topic_id: other_topic.id,
        title: '-- other encrypted title --',
        keys: {
          user.username => '-- other key of user --',
          user2.username => '-- other key of user2 --'
        }
      }

      expect(response.status).to eq(200)
      expect(other_topic.custom_fields['encrypted_title']).to eq('-- other encrypted title --')
      expect(store.get("key_#{other_topic.id}_#{user.id}")).to eq('-- other key of user --')
      expect(store.get("key_#{other_topic.id}_#{user2.id}")).to eq('-- other key of user2 --')
    end

    it 'saves encrypted topic title' do
      sign_in(user)

      put '/encrypt/topic', params: {
        topic_id: topic.id,
        title: '-- new encrypted title --',
      }

      topic.reload

      expect(response.status).to eq(200)
      expect(topic.custom_fields['encrypted_title']).to eq('-- new encrypted title --')
      expect(store.get("key_#{topic.id}_#{user.id}")).to eq('-- the key of user --')
      expect(store.get("key_#{topic.id}_#{user2.id}")).to eq('-- the key of user2 --')
    end

    it 'saves encrypted topic key for each user' do
      sign_in(user)

      put '/encrypt/topic', params: {
        topic_id: topic.id,
        keys: {
          user.username => '-- new key of user --',
          user2.username => '-- new key of user2 --'
        }
      }

      expect(response.status).to eq(200)
      expect(topic.custom_fields['encrypted_title']).to eq('-- the encrypted title --')
      expect(store.get("key_#{topic.id}_#{user.id}")).to eq('-- new key of user --')
      expect(store.get("key_#{topic.id}_#{user2.id}")).to eq('-- new key of user2 --')
    end
  end

  context '#destroy_topic' do
    it 'does not work when not logged in' do
      delete '/encrypt/topic', params: { topic_id: topic.id, usernames: [ user.username ] }

      expect(response.status).to eq(403)
      expect(store.get("key_#{topic.id}_#{user.id}")).to eq('-- the key of user --')
      expect(store.get("key_#{topic.id}_#{user2.id}")).to eq('-- the key of user2 --')
    end

    it 'does not work for users who cannot see topic' do
      sign_in(user3)

      delete '/encrypt/topic', params: { topic_id: topic.id, usernames: [ user.username ] }

      expect(response.status).to eq(403)
      expect(store.get("key_#{topic.id}_#{user.id}")).to eq('-- the key of user --')
      expect(store.get("key_#{topic.id}_#{user2.id}")).to eq('-- the key of user2 --')
    end

    it 'deletes topic keys' do
      sign_in(user)

      expect(store.get("key_#{topic.id}_#{user.id}")).to eq('-- the key of user --')
      expect(store.get("key_#{topic.id}_#{user2.id}")).to eq('-- the key of user2 --')

      delete '/encrypt/topic', params: { topic_id: topic.id, usernames: [ user.username ] }

      expect(response.status).to eq(200)
      expect(store.get("key_#{topic.id}_#{user.id}")).to eq(nil)
      expect(store.get("key_#{topic.id}_#{user2.id}")).to eq('-- the key of user2 --')
    end
  end

  context '#reset_user' do
    before do
      user.custom_fields['encrypt_public_key']  = '-- the public key --'
      user.custom_fields['encrypt_private_key'] = '-- the private key --'
      user.custom_fields['encrypt_salt']        = '-- the salt --'
      user.save_custom_fields

      store.set("key_#{topic.id}_#{user.id}", '-- user key --')

      sign_in(user)
    end

    it 'resets everything' do
      user.grant_admin!

      expect { post '/encrypt/reset', params: { user_id: user.id, everything: true } }
        .to change { TopicAllowedUser.count }.by(-1)
        .and change { PluginStoreRow.count }.by(-1)
        .and change { UserCustomField.count }.by(-3)

      expect(response.status).to eq(200)
    end

    it 'allows only staff members' do
      expect { post '/encrypt/reset', params: { user_id: user.id } }
        .to change { TopicAllowedUser.count }.by(0)
        .and change { PluginStoreRow.count }.by(0)
        .and change { UserCustomField.count }.by(0)

      expect(response.status).to eq(403)
    end
  end
end

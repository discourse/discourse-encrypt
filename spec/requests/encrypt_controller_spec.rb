# frozen_string_literal: true

require 'rails_helper'

describe DiscourseEncrypt::EncryptController do
  let(:user)  { Fabricate(:encrypt_user) }
  let(:user2) { Fabricate(:encrypt_user) }
  let(:user3) { Fabricate(:user) }

  context '#update_keys' do
    it 'does not work when not logged in' do
      put '/encrypt/keys', params: { public: '0$publicKey', private: '0$privateKey' }
      expect(response.status).to eq(403)
    end

    it 'does not work when user is not allowed' do
      group = Fabricate(:group)
      SiteSetting.encrypt_groups = group.name
      sign_in(user3)

      put '/encrypt/keys', params: { public: '0$publicKey', private: '0$privateKey' }
      expect(response.status).to eq(403)

      group.add(user3)

      put '/encrypt/keys', params: { public: '0$publicKey', private: '0$privateKey' }
      expect(response.status).to eq(200)
    end

    it 'saves user keys' do
      sign_in(user3)

      put '/encrypt/keys', params: { public: '0$publicKey', private: '0$privateKey' }
      expect(response.status).to eq(200)
      expect(user3.custom_fields[DiscourseEncrypt::PUBLIC_CUSTOM_FIELD]).to eq('0$publicKey')
      expect(user3.custom_fields[DiscourseEncrypt::PRIVATE_CUSTOM_FIELD]).to eq('0$privateKey')
    end

    it 'updates user keys' do
      old_public_key = user.custom_fields[DiscourseEncrypt::PUBLIC_CUSTOM_FIELD]
      sign_in(user)

      put '/encrypt/keys', params: { public: old_public_key, private: '0$newPrivateKey' }
      expect(response.status).to eq(200)
      user.reload
      expect(user.custom_fields[DiscourseEncrypt::PUBLIC_CUSTOM_FIELD]).to eq(old_public_key)
      expect(user.custom_fields[DiscourseEncrypt::PRIVATE_CUSTOM_FIELD]).to eq('0$newPrivateKey')
    end

    it 'does not allow updating if wrong public key' do
      old_public_key = user.custom_fields[DiscourseEncrypt::PUBLIC_CUSTOM_FIELD]
      old_private_key = user.custom_fields[DiscourseEncrypt::PRIVATE_CUSTOM_FIELD]
      sign_in(user)

      put '/encrypt/keys', params: { public: '0$wrongPublicKey', private: '0$newPrivateKey' }
      expect(response.status).to eq(409)
      expect(user.custom_fields[DiscourseEncrypt::PUBLIC_CUSTOM_FIELD]).to eq(old_public_key)
      expect(user.custom_fields[DiscourseEncrypt::PRIVATE_CUSTOM_FIELD]).to eq(old_private_key)
    end
  end

  context '#show_user' do
    it 'does not work when not logged in' do
      get '/encrypt/user', params: { usernames: [ user.username, user2.username, user3.username ] }
      expect(response.status).to eq(404)
    end

    it 'gets the right user keys' do
      sign_in(user)

      get '/encrypt/user', params: { usernames: [ user.username, user2.username, user3.username ] }
      expect(response.status).to eq(200)
      json = ::JSON.parse(response.body)
      expect(json.size).to eq(3)
      expect(json[user.username]).to eq(user.custom_fields[DiscourseEncrypt::PUBLIC_CUSTOM_FIELD])
      expect(json[user2.username]).to eq(user2.custom_fields[DiscourseEncrypt::PUBLIC_CUSTOM_FIELD])
      expect(json[user3.username]).to eq(nil)
    end
  end

  context '#reset_user' do
    let!(:topic) do
      Fabricate(:encrypt_topic, topic_allowed_users: [
        Fabricate.build(:topic_allowed_user, user: user),
        Fabricate.build(:topic_allowed_user, user: user2)
      ])
    end

    before do
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

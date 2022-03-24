# frozen_string_literal: true

require 'rails_helper'

describe DiscourseEncrypt::EncryptController do
  let(:user)  { Fabricate(:encrypt_user) }
  let(:user2) { Fabricate(:encrypt_user) }
  let(:user3) { Fabricate(:user) }

  context '#update_keys' do
    it 'does not work when not logged in' do
      put '/encrypt/keys.json', params: { public: '0$publicKey', private: '0$privateKey' }
      expect(response.status).to eq(403)
    end

    it 'does not work when user is not allowed' do
      group = Fabricate(:group, name: 'GrOuP')
      SiteSetting.encrypt_groups = 'gRoUp'
      sign_in(user3)

      put '/encrypt/keys.json', params: { public: '0$publicKey', private: '0$privateKey' }
      expect(response.status).to eq(403)

      group.add(user3)

      put '/encrypt/keys.json', params: { public: '0$publicKey', private: '0$privateKey' }
      expect(response.status).to eq(200)
    end

    it 'saves user keys' do
      sign_in(user3)

      put '/encrypt/keys.json', params: { public: '0$publicKey', private: '0$privateKey' }
      expect(response.status).to eq(200)
      expect(user3.user_encryption_key.encrypt_public).to eq('0$publicKey')
      expect(user3.user_encryption_key.encrypt_private).to eq('0$privateKey')
    end

    it 'updates user keys' do
      old_public_key = user.user_encryption_key.encrypt_public

      sign_in(user)

      put '/encrypt/keys.json', params: { public: old_public_key, private: '0$newPrivateKey' }
      expect(response.status).to eq(200)
      user.reload
      expect(user.user_encryption_key.encrypt_public).to eq(old_public_key)
      expect(user.user_encryption_key.encrypt_private).to eq('0$newPrivateKey')
    end

    it 'does not allow updating if wrong public key' do
      old_public_key = user.user_encryption_key.encrypt_public
      old_private_key = user.user_encryption_key.encrypt_private
      sign_in(user)

      put '/encrypt/keys.json', params: { public: '0$wrongPublicKey', private: '0$newPrivateKey' }
      expect(response.status).to eq(409)
      expect(user.user_encryption_key.encrypt_public).to eq(old_public_key)
      expect(user.user_encryption_key.encrypt_private).to eq(old_private_key)
    end
  end

  context '#show_user' do
    it 'does not work when not logged in' do
      get '/encrypt/user.json', params: { usernames: [ user.username, user2.username, user3.username ] }
      expect(response.status).to eq(403)
    end

    it 'gets the right user keys' do
      sign_in(user)

      get '/encrypt/user.json', params: { usernames: [ user.username, user2.username, user3.username ] }
      expect(response.status).to eq(200)
      json = ::JSON.parse(response.body)
      expect(json.size).to eq(3)
      expect(json[user.username]).to eq(user.user_encryption_key.encrypt_public)
      expect(json[user2.username]).to eq(user2.user_encryption_key.encrypt_public)
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
      expect { post '/encrypt/reset.json', params: { user_id: user.id, everything: true } }
        .to change { TopicAllowedUser.count }.by(-1)
        .and change { EncryptedTopicsUser.count }.by(-1)
        .and change { UserEncryptionKey.count }.by(-1)

      expect(response.status).to eq(200)
    end

    it 'resets only keys' do
      expect { post '/encrypt/reset.json', params: { user_id: user.id } }
        .to change { TopicAllowedUser.count }.by(0)
        .and change { EncryptedTopicsUser.count }.by(0)
        .and change { UserEncryptionKey.count }.by(-1)

      expect(response.status).to eq(200)
    end
  end

  context '#update_post' do
    let!(:post) { Fabricate(:encrypt_post) }

    before do
      SiteSetting.min_trust_to_edit_post = 2
    end

    it 'is not raising error when user cannot edit because min trust level' do
      sign_in(post.user)
      put '/encrypt/post.json', params: { post_id: post.id, encrypted_raw: 'some encrypted raw' }
      expect(response.status).to eq(200)
    end

    it 'does not work if user is not author of post' do
      sign_in(user)
      put '/encrypt/post.json', params: { post_id: post.id, encrypted_raw: 'some encrypted raw' }
      expect(response.status).to eq(403)
    end
  end

  context '#posts' do
    let!(:topic) { Fabricate(:encrypt_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }
    let!(:post) { Fabricate(:post, topic: topic) }

    before do
      SearchIndexer.enable
      SearchIndexer.index(topic, force: true)
    end

    it 'does not work when not logged in' do
      get '/encrypt/posts.json'
      expect(response.status).to eq(403)
    end

    it 'does not fetch posts user cannot read' do
      admin = Fabricate(:admin)
      sign_in(admin)

      topic = Fabricate(:encrypt_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: admin) ])
      Fabricate(:post, topic: topic)
      Fabricate(:post, topic: topic)

      get '/encrypt/posts.json'
      expect(response.status).to eq(200)
      expect(response.parsed_body['topics'].size).to eq(1)
      expect(response.parsed_body['posts'].size).to eq(1)
    end

    it 'fetches posts' do
      sign_in(user)

      get '/encrypt/posts.json'
      expect(response.status).to eq(200)
      expect(response.parsed_body['topics'].size).to eq(1)
      expect(response.parsed_body['posts'].size).to eq(1)
    end

    it 'fetches posts when use_pg_headlines_for_excerpt is enabled' do
      SiteSetting.use_pg_headlines_for_excerpt = true
      sign_in(user)

      get '/encrypt/posts.json'
      expect(response.status).to eq(200)
      expect(response.parsed_body['topics'].size).to eq(1)
      expect(response.parsed_body['posts'].size).to eq(1)
    end
  end

  context '#show_all_keys' do
    let!(:topic1) { Fabricate(:encrypt_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }
    let!(:topic2) { Fabricate(:encrypt_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }
    let!(:topic3) { Fabricate(:encrypt_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user2) ]) }

    it 'returns all topic keys' do
      sign_in(user)

      get '/encrypt/rotate.json'

      expect(response.parsed_body['keys']).to eq(nil)
    end
  end

  context '#update_all_keys' do
    let!(:topic1) { Fabricate(:encrypt_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }
    let!(:topic2) { Fabricate(:encrypt_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }
    let!(:topic3) { Fabricate(:encrypt_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user2) ]) }

    it 'updates only if public keys is present' do
      sign_in(user)

      put '/encrypt/rotate.json', params: {
        keys: {
          topic1.id => 'first key',
          topic2.id => 'second key'
        }
      }

      expect(response.status).to eq(400)
    end

    it 'updates only if all topic keys are present' do
      sign_in(user)

      put '/encrypt/rotate.json', params: {
        public: 'public key'
      }

      expect(response.status).to eq(400)
    end

    it 'updates public keys even if user does not have access to any encrypted topic' do
      EncryptedTopicsUser.where(user: user).delete_all
      sign_in(user)

      put '/encrypt/rotate.json', params: {
        public: 'public key'
      }

      expect(response.status).to eq(200)
    end

    it 'updates all keys' do
      sign_in(user)

      put '/encrypt/rotate.json', params: {
        public: 'public key',
        keys: {
          topic1.id => 'first key',
          topic2.id => 'second key'
        }
      }

      expect(response.status).to eq(200)

      expect(UserEncryptionKey.find_by(user: user).encrypt_public).to eq('public key')
      expect(UserEncryptionKey.find_by(user: user).encrypt_private).to eq(nil)

      expect(EncryptedTopicsUser.find_by(user: user, topic: topic1).key).to eq('first key')
      expect(EncryptedTopicsUser.find_by(user: user, topic: topic2).key).to eq('second key')
    end
  end
end

# frozen_string_literal: true

Fabricator(:encrypt_user, from: :user) do
  after_create do |user|
    UserEncryptionKey.create!(
      user_id: user.id,
      encrypt_public: Fabricate.sequence(:encrypt) { |i| "0$publicKey#{i}" },
      encrypt_private: Fabricate.sequence(:encrypt) { |i| "0$privateKey#{i}" }
    )
  end
end

Fabricator(:encrypt_topic, from: :private_message_topic) do
  title 'A secret message'
  topic_allowed_users do |attrs|
    [
      Fabricate.build(:topic_allowed_user, user: attrs[:user]),
      Fabricate.build(:topic_allowed_user, user: Fabricate.build(:encrypt_user))
    ]
  end
  encrypted_topics_data

  after_create do |topic|
    topic.topic_allowed_users.each do |allowed_user|
      DiscourseEncrypt::set_key(
        topic.id,
        allowed_user.user_id,
        Fabricate.sequence(:encrypt) { |i| "0$topicKey#{i}" }
      )
    end
  end
end

Fabricator(:encrypted_topics_data) do
  title Fabricate.sequence(:title) { |i| "0$topicKey#{i}" }
end

Fabricator(:encrypt_post, from: :private_message_post) do
  user
  topic do |attrs|
    Fabricate(:encrypt_topic,
      user: attrs[:user],
      created_at: attrs[:created_at],
      topic_allowed_users: [
        Fabricate.build(:topic_allowed_user, user: attrs[:user]),
        Fabricate.build(:topic_allowed_user, user: Fabricate.build(:encrypt_user))
      ]
    )
  end
  raw Fabricate.sequence(:encrypt) { |i| "0$base64encryptedRaw#{i}" }
end

# frozen_string_literal: true

Fabricator(:encrypt_user, from: :user) do
  after_create do |user|
    UserEncryptionKey.create!(
      user_id: user.id,
      encrypt_public: Fabricate.sequence(:encrypt) { |i| "0$publicKey#{i}" },
      encrypt_private: Fabricate.sequence(:encrypt) { |i| "0$privateKey#{i}" },
    )
  end
end

Fabricator(:encrypt_topic, from: :private_message_topic) do
  title "A secret message"
  topic_allowed_users do |attrs|
    [
      Fabricate.build(:topic_allowed_user, user: attrs[:user]),
      Fabricate.build(:topic_allowed_user, user: Fabricate.build(:encrypt_user)),
    ]
  end
  encrypted_topics_data

  after_create do |topic|
    topic.topic_allowed_users.each do |allowed_user|
      EncryptedTopicsUser.create!(
        topic_id: topic.id,
        user_id: allowed_user.user_id,
        key: Fabricate.sequence(:encrypt) { |i| "0$topicKey#{i}" },
      )
    end
  end
end

Fabricator(:encrypted_topics_data) { title Fabricate.sequence(:title) { |i| "0$topicKey#{i}" } }

Fabricator(:encrypt_post, from: :private_message_post) do
  user
  topic do |attrs|
    Fabricate(
      :encrypt_topic,
      user: attrs[:user],
      created_at: attrs[:created_at],
      topic_allowed_users: [
        Fabricate.build(:topic_allowed_user, user: attrs[:user]),
        Fabricate.build(:topic_allowed_user, user: Fabricate.build(:encrypt_user)),
      ],
    )
  end
  raw Fabricate.sequence(:encrypt) { |i| "0$base64encryptedRaw#{i}" }
end

module EncryptSystemHelpers
  def encrypt_system_bootstrap(user)
    SiteSetting.encrypt_enabled = true
    SiteSetting.encrypt_groups = "trust_level_1"
    SiteSetting.encrypt_pms_default = true
    Group.refresh_automatic_groups!
  end

  # NOTE: For enable_encrypt_with_keys_for_user and activate_encrypt. Since we
  # do a lot of complex cryptography logic client-side, there are a lot of things
  # we must do in the browser. However, we can at least start with some known
  # good keys for the UserEncryptionKey. This simulates the user clicking Enable
  # Encrypted Messages in the UI and also generating the paper key.
  #
  # Activating encryption must be done in the browser for every test, since it
  # inserts records into an IndexedDb in the browser among other things. This
  # must be called for both the current user and every user that user will be
  # sending messages to.
  def enable_encrypt_with_keys_for_user(user, num = 1)
    UserEncryptionKey.create!(
      user: user,
      encrypt_private: test_private_key(num),
      encrypt_public: test_public_key(num),
    )
  end

  def activate_encrypt(user_preferences_page, user, num = 1)
    user_preferences_page.visit(user)
    click_link "Security"
    find("#passphrase").fill_in(with: test_paper_key(num))
    find("#encrypt-activate").click
    expect(page).to have_content(I18n.t("js.encrypt.preferences.status_enabled"))
    expect(page.execute_script("return localStorage[\"discourse-encrypt\"]")).to eq("true")
  end

  # NOTE: Only two combinations of private/public/paper keys have been provided thusfar,
  # to allow for both the current user and a target user to have encrypt enabled. To
  # add more in future, follow these steps:
  #
  # 1. Open the "Encrypt | Enabling encrypted messages -> enables encryption and generates paper keys"
  #    system test and add pause_test to the bottom of the `it` block.
  # 2. When the test is paused, copy the paper_key into a new file, then copy
  #    current_user.reload.user_encryption_key.encrypt_private into a new test_private_key_N.txt
  #    file and copy current_user.reload.user_encryption_key.encrypt_public into a new
  #    test_public_key_N.txt file
  #
  # This is all very manual, but we shouldn't have to do it often, and it saves having
  # to do a huge amount of manual setup for each test.
  def test_paper_key(num = 1)
    File.read(
      Rails.root.join("plugins", "discourse-encrypt", "spec/fixtures/test_paper_key_#{num}.txt"),
    ).chomp
  end

  def test_private_key(num = 1)
    File.read(
      Rails.root.join("plugins", "discourse-encrypt", "spec/fixtures/test_private_key_#{num}.txt"),
    ).chomp
  end

  def test_public_key(num = 1)
    File.read(
      Rails.root.join("plugins", "discourse-encrypt", "spec/fixtures/test_public_key_#{num}.txt"),
    ).chomp
  end

  def enable_encrypt_for_user_in_session(user, user_preferences_page)
    using_session("user_#{user.username}_enable_encrypt") do
      sign_in(user)
      enable_encrypt_with_keys_for_user(user, 2)
      activate_encrypt(user_preferences_page, user, 2)
    end
  end
end

RSpec.configure { |config| config.include EncryptSystemHelpers, type: :system }

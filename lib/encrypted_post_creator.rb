# frozen_string_literal: true

class EncryptedPostCreator < PostCreator
  def initialize(user, opts)
    super
  end

  def create
    if encrypt_valid?
      topic_key = @opts[:topic_key] || SecureRandom.random_bytes(32)

      # Encrypt title and post contents
      @opts[:raw] = EncryptedPostCreator.encrypt(@opts[:raw], topic_key)
      if title = @opts[:title]
        @opts[:title] = I18n.t('js.encrypt.encrypted_topic_title')
      end

      ret = super
    end

    if @post && errors.blank?
      # Save the topic key if this is a new topic
      if !@opts[:topic_key]
        users.each do |user|
          key = EncryptedPostCreator.export_key(user, topic_key)
          EncryptedTopicsUser.create!(topic_id: @post.topic_id, user_id: user.id, key: key)
        end
      end

      encrypt_topic_title = EncryptedTopicsData.find_or_initialize_by(topic_id: @post.topic_id)
      encrypt_topic_title.update!(title: EncryptedPostCreator.encrypt(title, topic_key))
    end

    ret
  end

  def encrypt_valid?
    @topic = Topic.find_by(id: @opts[:topic_id]) if @opts[:topic_id]
    if @opts[:archetype] != Archetype.private_message && !@topic&.is_encrypted?
      errors.add(:base, I18n.t('encrypt.only_pms'))
      return false
    end

    users.each do |user|
      if !user.encrypt_key
        errors.add(:base, I18n.t('js.encrypt.composer.user_has_no_key', username: user.username))
        return false
      end
    end

    true
  end

  private

  def users
    @users ||= User
      .includes(:user_encryption_key)
      .where(username_lower: (@opts[:target_usernames].split(',') << @user.username).map(&:downcase))
      .to_a
  end

  def self.encrypt(raw, key)
    iv = SecureRandom.random_bytes(12)

    cipher = OpenSSL::Cipher::AES.new(256, :GCM).encrypt
    cipher.key = key
    cipher.iv = iv
    cipher.auth_data = ''

    plaintext = JSON.dump(raw: raw)
    ciphertext = cipher.update(plaintext)
    ciphertext += cipher.final
    ciphertext += cipher.auth_tag

    "1$#{Base64.strict_encode64(iv)}#{Base64.strict_encode64(ciphertext)}"
  end

  def self.export_key(user, topic_key)
    Base64.strict_encode64(user.encrypt_key.public_encrypt_oaep256(topic_key))
  end
end

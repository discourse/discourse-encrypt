# frozen_string_literal: true

class PostCreator
  def create_encrypted
    topic_key = @opts[:topic_key] || SecureRandom.random_bytes(32)

    @opts[:raw] = PostCreator.encrypted_post(@opts[:raw], topic_key)
    if title = @opts[:title]
      @opts[:title] = I18n.t("js.encrypt.encrypted_topic_title")
      @opts[:topic_opts] ||= {}
      @opts[:topic_opts][:custom_fields] ||= {}
      @opts[:topic_opts][:custom_fields][:encrypted_title] = PostCreator.encrypted_post(title, topic_key)
    end

    return if !create

    names = @opts[:target_usernames].split(',')
    users = User.where(username: names)
    User.preload_custom_fields(users, ['encrypt_public'])

    if !@opts[:topic_key]
      users.each do |user|
        key = PostCreator.export_key(user, topic_key)
        DiscourseEncrypt::Store.set("key_#{@post.topic_id}_#{user.id}", key)
      end
    end

    @post
  end

  private

  def self.encrypted_post(raw, key)
    iv = SecureRandom.random_bytes(12)

    cipher = OpenSSL::Cipher::AES.new(256, :GCM).encrypt
    cipher.key = key
    cipher.iv = iv
    cipher.auth_data = ""

    plaintext = JSON.dump(raw: raw)
    ciphertext = cipher.update(plaintext)
    ciphertext += cipher.final
    ciphertext += cipher.auth_tag

    "1$#{Base64.strict_encode64(iv)}#{Base64.strict_encode64(ciphertext)}"
  end

  def self.export_key(user, topic_key)
    identity = user.custom_fields['encrypt_public']
    jwk = JSON.parse(Base64.decode64(identity[2..]))['encryptPublic']

    n = OpenSSL::BN.new(Base64.urlsafe_decode64(jwk['n']), 2)
    e = OpenSSL::BN.new(Base64.urlsafe_decode64(jwk['e']), 2)
    user_key = OpenSSL::PKey::RSA.new.tap { |k| k.set_key(n, e, nil) }

    Base64.strict_encode64(user_key.public_encrypt_oaep256(topic_key))
  end
end

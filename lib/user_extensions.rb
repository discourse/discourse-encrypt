# frozen_string_literal: true

module UserExtensions
  def encrypt_key
    @encrypt_key ||= begin
      identity = self.user_encryption_key&.encrypt_public
      return nil if !identity

      # Check identity version
      version, identity = identity.split('$', 2)
      return nil if version.to_i != 1

      jwk = JSON.parse(Base64.decode64(identity))['encryptPublic']
      n = OpenSSL::BN.new(Base64.urlsafe_decode64(jwk['n']), 2)
      e = OpenSSL::BN.new(Base64.urlsafe_decode64(jwk['e']), 2)

      OpenSSL::PKey::RSA.new.tap { |k| k.set_key(n, e, nil) }
    end
  end

  def publish_identity
    MessageBus.publish(
      '/plugin/encrypt/keys',
      {
        public: self.user_encryption_key&.encrypt_public,
        private: self.user_encryption_key&.encrypt_private
      },
      user_ids: [self.id]
    )
  end
end

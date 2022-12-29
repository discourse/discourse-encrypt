# frozen_string_literal: true

require "openssl"
require "securerandom"

module OpenSSL
  module PKey
    class RSA
      def public_encrypt_oaep256(msg)
        public_encrypt(PKCS1.oaep_mgf1(msg, n.num_bytes), OpenSSL::PKey::RSA::NO_PADDING)
      end
    end
  end

  module PKCS1
    # Public-Key Cryptography Standards (PKCS) #1: RSA Cryptography
    # Page 18, https://www.ietf.org/rfc/rfc3447
    def oaep_mgf1(msg, k)
      m_len = msg.bytesize
      h_len = OpenSSL::Digest::SHA256.new.digest_length
      raise OpenSSL::PKey::RSAError, "message too long" if m_len > k - 2 * h_len - 2

      l_hash = OpenSSL::Digest::SHA256.digest("") # label = ''
      ps = [0] * (k - m_len - 2 * h_len - 2)
      db = l_hash + ps.pack("C*") + [1].pack("C") + [msg].pack("a*")
      seed = SecureRandom.random_bytes(h_len)
      db_mask = mgf1(seed, k - h_len - 1)
      masked_db = db.bytes.zip(db_mask).map! { |a, b| a ^ b }.pack("C*")
      seed_mask = mgf1(masked_db, h_len)
      masked_seed = seed.bytes.zip(seed_mask).map! { |a, b| a ^ b }.pack("C*")
      [0, masked_seed, masked_db].pack("Ca*a*")
    end

    module_function :oaep_mgf1

    # Public-Key Cryptography Standards (PKCS) #1: RSA Cryptography
    # Page 54, https://www.ietf.org/rfc/rfc3447
    def mgf1(seed, mask_len)
      c = 0
      t = []
      while t.size < mask_len
        t += OpenSSL::Digest::SHA256.digest([seed, c].pack("a*N")).bytes
        c += 1
      end
      t[0..mask_len]
    end

    module_function :mgf1
  end
end

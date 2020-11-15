# frozen_string_literal: true

module PostExtensions
  def self.prepended(base)
    base.has_one :encrypted_post_timer
  end

  def ciphertext
    raw.split("\n")[0] || ""
  end

  def is_encrypted?
    !!(topic&.is_encrypted? &&
       ciphertext.match(/\A[A-Za-z0-9+\/=$]+\Z/))
  end
end

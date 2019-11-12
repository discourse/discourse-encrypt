# frozen_string_literal: true

module PostExtensions
  def is_encrypted?
    !!(topic&.is_encrypted? &&
        raw.match(/\A[A-Za-z0-9+\\\/=$]+(\n.*)?\Z/))
  end
end

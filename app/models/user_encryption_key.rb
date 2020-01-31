# frozen_string_literal: true

class UserEncryptionKey < ActiveRecord::Base
  belongs_to :user
end

# frozen_string_literal: true

class EncryptedTopicsUser < ActiveRecord::Base
  belongs_to :topic
  belongs_to :user
end

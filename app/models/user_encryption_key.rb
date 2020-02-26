# frozen_string_literal: true

class UserEncryptionKey < ActiveRecord::Base
  belongs_to :user
end

# == Schema Information
#
# Table name: user_encryption_keys
#
#  id              :bigint           not null, primary key
#  user_id         :integer
#  encrypt_public  :text
#  encrypt_private :text
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#
# Indexes
#
#  index_user_encryption_keys_on_user_id  (user_id)
#

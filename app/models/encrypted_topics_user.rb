# frozen_string_literal: true

class EncryptedTopicsUser < ActiveRecord::Base
  belongs_to :topic
  belongs_to :user
end

# == Schema Information
#
# Table name: encrypted_topics_users
#
#  id       :bigint           not null, primary key
#  user_id  :integer
#  topic_id :integer
#  key      :text
#
# Indexes
#
#  index_encrypted_topics_users_on_topic_id              (topic_id)
#  index_encrypted_topics_users_on_user_id               (user_id)
#  index_encrypted_topics_users_on_user_id_and_topic_id  (user_id,topic_id) UNIQUE
#

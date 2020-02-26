# frozen_string_literal: true

class EncryptedTopicsData < ActiveRecord::Base
  belongs_to :topic
end

# == Schema Information
#
# Table name: encrypted_topics_data
#
#  id         :bigint           not null, primary key
#  topic_id   :integer
#  title      :text
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
# Indexes
#
#  index_encrypted_topics_data_on_topic_id  (topic_id)
#

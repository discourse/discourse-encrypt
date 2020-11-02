# frozen_string_literal: true

class EncryptedTimeBomb < ActiveRecord::Base
  belongs_to :post

  validates :post_id, presence: true
  validates :detonate_at, presence: true

  scope :pending, -> { where(exploded_at: nil).where('detonate_at < ?', Time.zone.now) }
end

# == Schema Information
#
# Table name: encrypted_time_bombs
#
#  id          :bigint           not null, primary key
#  post_id     :integer          not null
#  detonate_at  :datetime         not null
#  exploded_at :datetime
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#
# Indexes
#
#  index_encrypted_time_bombs_on_post_id  (post_id)
#

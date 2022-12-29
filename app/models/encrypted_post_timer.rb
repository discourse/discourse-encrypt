# frozen_string_literal: true

class EncryptedPostTimer < ActiveRecord::Base
  belongs_to :post

  validates :post_id, presence: true
  validates :delete_at, presence: true

  scope :pending, -> { where(destroyed_at: nil).where("delete_at < ?", Time.zone.now) }
end

# == Schema Information
#
# Table name: encrypted_post_timers
#
#  id           :bigint           not null, primary key
#  post_id      :integer          not null
#  delete_at    :datetime         not null
#  destroyed_at :datetime
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#
# Indexes
#
#  index_encrypted_post_timers_on_delete_at     (delete_at)
#  index_encrypted_post_timers_on_destroyed_at  (destroyed_at)
#  index_encrypted_post_timers_on_post_id       (post_id)
#

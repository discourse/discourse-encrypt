# frozen_string_literal: true

class CreateEncryptedPostTimers < ActiveRecord::Migration[6.0]
  def change
    create_table :encrypted_post_timers do |t|
      t.integer :post_id, null: false
      t.datetime :delete_at, null: false
      t.datetime :destroyed_at
      t.timestamps
    end

    add_index :encrypted_post_timers, :post_id
    add_index :encrypted_post_timers, :delete_at
    add_index :encrypted_post_timers, :destroyed_at
  end
end

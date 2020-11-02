# frozen_string_literal: true

class CreateEncryptedTimeBomb < ActiveRecord::Migration[6.0]
  def change
    create_table :encrypted_time_bombs do |t|
      t.integer :post_id, null: false
      t.datetime :detonate_at, null: false
      t.datetime :exploded_at
      t.timestamps
    end

    add_index :encrypted_time_bombs, :post_id
  end
end

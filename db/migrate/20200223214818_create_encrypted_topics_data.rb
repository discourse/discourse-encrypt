# frozen_string_literal: true

class CreateEncryptedTopicsData < ActiveRecord::Migration[6.0]
  def up
    create_table :encrypted_topics_data do |t|
      t.integer :topic_id, index: true
      t.text :title
      t.timestamps
    end

    execute <<~SQL
      INSERT INTO encrypted_topics_data(topic_id, title, created_at, updated_at)
      SELECT topic_id, value AS title, created_at, updated_at
      FROM topic_custom_fields
      WHERE name = 'encrypted_title'
    SQL

    execute <<~SQL
      DELETE
      FROM topic_custom_fields
      WHERE name = 'encrypted_title'
    SQL
  end

  def down
    execute <<~SQL
      INSERT INTO topic_custom_fields(topic_id, value, name, created_at, updated_at)
      SELECT topic_id, title AS value, 'encrypted_title' AS name, created_at, updated_at
      FROM encrypted_topics_data
    SQL
    drop_table :encrypted_topics_data
  end
end

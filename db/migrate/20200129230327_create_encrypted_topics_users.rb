# frozen_string_literal: true

class CreateEncryptedTopicsUsers < ActiveRecord::Migration[6.0]
  def up
    create_table :encrypted_topics_users do |t|
      t.integer :user_id, index: true
      t.integer :topic_id, index: true
      t.text :key
    end

    add_index :encrypted_topics_users, [:user_id, :topic_id], unique: true

    execute <<~SQL
      INSERT INTO encrypted_topics_users(user_id, topic_id, key)
      SELECT split_part(key, '_', 3)::INTEGER AS user_id, split_part(key, '_', 2)::INTEGER AS topic_id, value
      FROM plugin_store_rows
      WHERE plugin_name = 'discourse-encrypt' AND key LIKE 'key_%'
    SQL

    execute <<~SQL
      DELETE FROM plugin_store_rows
      WHERE plugin_name = 'discourse-encrypt' AND key LIKE 'key_%'
    SQL
  end

  def down
    execute <<~SQL
      INSERT INTO plugin_store_rows(plugin_name, key, type_name, value)
      SELECT 'discourse-encrypt' AS plugin_name, CONCAT('key_', topic_id, '_', user_id) AS key, 'string' AS type_name, key AS value
      FROM encrypted_topics_users
    SQL
    drop_table :encrypted_topics_users
  end
end

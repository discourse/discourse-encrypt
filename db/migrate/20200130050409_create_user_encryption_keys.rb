# frozen_string_literal: true

class CreateUserEncryptionKeys < ActiveRecord::Migration[6.0]
  def up
    create_table :user_encryption_keys do |t|
      t.integer :user_id, index: true, unique: true
      t.text :encrypt_public
      t.text :encrypt_private
      t.timestamps
    end

    execute <<~SQL
      INSERT INTO user_encryption_keys(user_id, encrypt_public, created_at, updated_at)
      SELECT user_id, value AS encrypt_public, created_at, updated_at
      FROM user_custom_fields
      WHERE name = 'encrypt_public'
    SQL

    execute <<~SQL
      UPDATE user_encryption_keys
      SET encrypt_private = user_custom_fields.value
      FROM user_custom_fields
      WHERE user_encryption_keys.user_id = user_custom_fields.user_id AND user_custom_fields.name = 'encrypt_private'
    SQL
  end

  def down
    execute <<~SQL
      INSERT INTO user_custom_fields(name, user_id, value, created_at, updated_at)
      SELECT 'encrypt_public' AS name, user_id, encrypt_public AS value, created_at, updated_at
      FROM user_encryption_keys
    SQL

    execute <<~SQL
      INSERT INTO user_custom_fields(name, user_id, value, created_at, updated_at)
      SELECT 'encrypt_private' AS name, user_id, encrypt_private AS value, created_at, updated_at
      FROM user_encryption_keys
    SQL
    drop_table :user_encryption_keys
  end
end

# frozen_string_literal: true

class CreateUserEncryptionKeys < ActiveRecord::Migration[6.0]
  def up
    create_table :user_encryption_keys do |t|
      t.integer :user_id, index: true, unique: true
      t.text :encrypt_public
      t.text :encrypt_private
    end

    if table_exists?(:user_custom_fields)
      public_keys = UserCustomField.where(name: "encrypt_public")
      private_keys = UserCustomField.where(name: "encrypt_private")

      public_keys.find_each do |public_key|
        user_encryption_key = UserEncryptionKey.find_or_initialize_by(user_id: public_key.user_id)
        user_encryption_key.encrypt_public = public_key.value
        user_encryption_key.save!
      end

      private_keys.find_each do |private_key|
        user_encryption_key = UserEncryptionKey.find_or_initialize_by(user_id: private_key.user_id)
        user_encryption_key.encrypt_private = private_key.value
        user_encryption_key.save!
      end

      public_keys.delete_all
      private_keys.delete_all
    end
  end

  def down
    UserEncryptionKey.find_each do |user_encryption_key|
      UserCustomField.create!(name: "encrypt_public", user_id: user_encryption_key.user_id, value: user_encryption_key.encrypt_public)
      UserCustomField.create!(name: "encrypt_private", user_id: user_encryption_key.user_id, value: user_encryption_key.encrypt_private)
    end
    drop_table :user_encryption_keys
  end
end

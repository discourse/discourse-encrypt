class CreateEncryptedTopicsUsers < ActiveRecord::Migration[6.0]
  def up
    create_table :encrypted_topics_users do |t|
      t.integer :user_id, index: true
      t.integer :topic_id, index: true
      t.text :key
    end

    add_index :encrypted_topics_users, [:user_id, :topic_id], unique: true

    if table_exists?(:plugin_store_rows)
      store_rows = PluginStoreRow.where(plugin_name: 'discourse-encrypt')
      store_rows.find_each do |row|
        _key_word, topic_id, user_id = row.key.split("_") # key_31_1
        EncryptedTopicsUser.create!(user_id: user_id, topic_id: topic_id, key: row.value)
      end
      store_rows.delete_all
    end
  end

  def down
    EncryptedTopicsUser.find_each do |encrypted_topics_user|
      key = "key_#{encrypted_topics_user.topic_id}_#{encrypted_topics_user.user_id}" # key_31_1
      PluginStoreRow.create!(plugin_name: "discourse-encrypt", key: key, type_name: "string", value: encrypted_topics_user.key)
    end
    drop_table :encrypted_topics_users
  end
end

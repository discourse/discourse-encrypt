# frozen_string_literal: true

class CreateEncryptedTopicsData < ActiveRecord::Migration[6.0]
  def up
    create_table :encrypted_topics_data do |t|
      t.integer :topic_id, index: true
      t.text :title
      t.timestamps
    end

    if table_exists?(:topic_custom_fields)
      topic_rows = TopicCustomField.where(name: 'encrypted_title')
      topic_rows.find_each do |row|
        EncryptedTopicsData.create(topic_id: row.topic_id, title: row.value, created_at: row.created_at, updated_at: row.updated_at)
      end
      topic_rows.delete_all
    end
  end

  def down
    EncryptedTopicsData.find_each do |encrypted_topics_data|
      TopicCustomField.create!(topic_id: encrypted_topics_data.topic_id, value: encrypted_topics_data.title, name: "encrypted_title", created_at: encrypted_topics_data.created_at, updated_at: encrypted_topics_data.updated_at)
    end
    drop_table :encrypted_topics_data
  end
end

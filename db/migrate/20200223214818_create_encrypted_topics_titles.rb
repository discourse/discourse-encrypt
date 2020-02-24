# frozen_string_literal: true

class CreateEncryptedTopicsTitles < ActiveRecord::Migration[6.0]
  def up

    create_table :encrypted_topics_titles do |t|
      t.integer :topic_id, index: true
      t.text :title
      t.timestamps
    end

    if table_exists?(:topic_custom_fields)
      topic_rows = TopicCustomField.where(name: 'encrypted_title')
      topic_rows.find_each do |row|
        EncryptedTopicsTitle.create(topic_id: row.topic_id, title: row.value, created_at: row.created_at, updated_at: row.updated_at)
      end
      topic_rows.delete_all
    end
  end

  def down
    EncryptedTopicsTitle.find_each do |encrypted_topics_title|
      TopicCustomField.create!(topic_id: encrypted_topics_title.topic_id, value: encrypted_topics_title.title, name: "encrypted_title", created_at: encrypted_topics_title.created_at, updated_at: encrypted_topics_title.updated_at)
    end
    drop_table :encrypted_topics_titles
  end
end

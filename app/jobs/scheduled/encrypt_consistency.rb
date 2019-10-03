# frozen_string_literal: true

module Jobs
  class EncryptConsistency < ::Jobs::Scheduled
    every 1.day

    def execute(args)
      DB.query(<<~SQL
          SELECT taf.user_id, taf.topic_id
          FROM topic_allowed_users taf
          JOIN topic_custom_fields tcf ON taf.topic_id = tcf.topic_id AND tcf.name = 'encrypted_title'
          WHERE 'key_' || taf.topic_id || '_' || taf.user_id NOT IN
            (SELECT key
            FROM plugin_store_rows
            WHERE plugin_name = 'discourse-encrypt' AND key LIKE 'key_%')
        SQL
      ).each do |row|
        Discourse.warn('User was invited to encrypted topic, but has no topic key.', user_id: row.user_id, topic_id: row.topic_id)
        TopicAllowedUser.find_by(user_id: row.user_id, topic_id: row.topic_id).delete
      end

      DB.query(<<~SQL
          WITH encrypt_keys AS (
            SELECT key, split_part(key, '_', 2)::INTEGER AS topic_id, split_part(key, '_', 3)::INTEGER AS user_id
            FROM plugin_store_rows
            WHERE plugin_name = 'discourse-encrypt' AND key LIKE 'key_%'
          )
          SELECT ek.user_id, ek.topic_id
          FROM encrypt_keys ek
          LEFT JOIN topic_allowed_users taf ON ek.topic_id = taf.topic_id AND ek.user_id = taf.user_id
          WHERE taf.id IS NULL
        SQL
      ).each do |row|
        Discourse.warn('User has topic key, but was not invited to topic.', user_id: row.user_id, topic_id: row.topic_id)
        # DiscourseEncrypt::Store.remove("key_#{row.topic_id}_#{row.user_id}")
      end
    end
  end
end

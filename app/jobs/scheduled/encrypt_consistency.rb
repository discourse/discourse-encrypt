# frozen_string_literal: true

module Jobs
  class EncryptConsistency < ::Jobs::Scheduled
    every 1.day

    def execute(args)
      DB.query(<<~SQL
          SELECT taf.user_id, taf.topic_id
          FROM topic_allowed_users taf
          JOIN encrypted_topics_data ett ON taf.topic_id = ett.topic_id
          WHERE taf.user_id NOT IN
            (SELECT user_id
            FROM encrypted_topics_users
            WHERE topic_id = taf.topic_id)
        SQL
      ).each do |row|
        Discourse.warn('User was invited to encrypted topic, but has no topic key.', user_id: row.user_id, topic_id: row.topic_id)
        TopicAllowedUser.find_by(user_id: row.user_id, topic_id: row.topic_id).delete
      end

      DB.query(<<~SQL
          SELECT etu.user_id, etu.topic_id
          FROM encrypted_topics_users etu
          LEFT JOIN topic_allowed_users taf ON etu.topic_id = taf.topic_id AND etu.user_id = taf.user_id
          WHERE taf.id IS NULL
        SQL
      ).each do |row|
        Discourse.warn('User has topic key, but was not invited to topic.', user_id: row.user_id, topic_id: row.topic_id)
        TopicAllowedUser.create(user_id: row.user_id, topic_id: row.topic_id)
      end
    end
  end
end

# frozen_string_literal: true

class AddPaperKeys < ActiveRecord::Migration[5.2]
  def up
    execute <<~SQL
      UPDATE user_custom_fields
      SET value = '{"passphrase": "' || value || '"}'
      WHERE name = 'encrypt_private'
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end

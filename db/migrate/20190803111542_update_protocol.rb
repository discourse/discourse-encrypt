class UpdateProtocol < ActiveRecord::Migration[5.2]
  def up
    execute <<~SQL
      UPDATE user_custom_fields
      SET name = 'encrypt_public', value = '0$' || value
      WHERE name = 'encrypt_public_key'
    SQL

    execute <<~SQL
      INSERT INTO user_custom_fields(user_id, name, value, created_at, updated_at)
      WITH public_keys AS ( SELECT user_id, value FROM user_custom_fields WHERE name = 'encrypt_public_key' ),
           private_keys AS ( SELECT user_id, value FROM user_custom_fields WHERE name = 'encrypt_private_key' ),
           salts AS ( SELECT user_id, value FROM user_custom_fields WHERE name = 'encrypt_salt' )
      SELECT users.id,
             'encrypt_private',
             '0$' || public_keys.value || '$' || private_keys.value || '$' || salts.value,
             NOW(),
             NOW()
      FROM users
      JOIN public_keys ON users.id = public_keys.user_id
      JOIN private_keys ON users.id = private_keys.user_id
      JOIN salts ON users.id = salts.user_id
    SQL

    execute <<~SQL
      DELETE FROM user_custom_fields
      WHERE name IN ('encrypt_public_key', 'encrypt_private_key', 'encrypt_salt')
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end

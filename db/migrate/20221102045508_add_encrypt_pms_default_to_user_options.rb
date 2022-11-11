# frozen_string_literal: true

class AddEncryptPmsDefaultToUserOptions < ActiveRecord::Migration[6.1]
  def up
    add_column :user_options, :encrypt_pms_default, :boolean, null: true

    execute "UPDATE user_options SET encrypt_pms_default = #{default_value}"

    change_column :user_options, :encrypt_pms_default, :boolean, null: false
  end

  def down
    remove_column :user_options, :encrypt_pms_default
  end

  def default_value
    setting_value = DB.query_single("SELECT value FROM site_settings WHERE name = 'encrypt_pms_default'").first
    setting_value == "t"
  end
end

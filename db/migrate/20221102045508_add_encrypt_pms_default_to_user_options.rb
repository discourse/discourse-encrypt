# frozen_string_literal: true

class AddEncryptPmsDefaultToUserOptions < ActiveRecord::Migration[6.1]
  def change
    add_column :user_options, :encrypt_pms_default, :boolean, default: default_value, null: false
  end

  def default_value
    setting_value = DB.query_single("SELECT value FROM site_settings WHERE name = 'encrypt_pms_default'").first
    setting_value == "t"
  end
end

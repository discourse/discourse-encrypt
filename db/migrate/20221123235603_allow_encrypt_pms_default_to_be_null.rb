# frozen_string_literal: true

class AllowEncryptPmsDefaultToBeNull < ActiveRecord::Migration[7.0]
  def up
    change_column_null(:user_options, :encrypt_pms_default, true)
  end

  def down
    change_column_null(:user_options, :encrypt_pms_default, false)
  end
end

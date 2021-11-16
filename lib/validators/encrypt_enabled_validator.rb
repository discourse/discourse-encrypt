# frozen_string_literal: true

class EncryptEnabledValidator
  def initialize(opts = {})
  end

  def valid_value?(value)
    !SiteSetting.content_security_policy || DiscourseEncrypt.safe_csp_src?(SiteSetting.content_security_policy_script_src) || value == 'f'
  end

  def error_message
    I18n.t('site_settings.errors.encrypt_unsafe_csp')
  end
end

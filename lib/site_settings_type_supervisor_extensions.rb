# frozen_string_literal: true

module DiscourseEncrypt::SiteSettingsTypeSupervisorExtensions
  def validate_content_security_policy(value)
    super if defined?(super)

    if value == "t" &&
         !DiscourseEncrypt.safe_csp_src?(SiteSetting.content_security_policy_script_src) &&
         SiteSetting.encrypt_enabled
      raise Discourse::InvalidParameters.new(I18n.t("site_settings.errors.encrypt_unsafe_csp"))
    end
  end

  def validate_content_security_policy_script_src(value)
    super if defined?(super)

    if SiteSetting.content_security_policy? && !DiscourseEncrypt.safe_csp_src?(value) &&
         SiteSetting.encrypt_enabled
      raise Discourse::InvalidParameters.new(I18n.t("site_settings.errors.encrypt_unsafe_csp"))
    end
  end
end

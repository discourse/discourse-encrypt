# frozen_string_literal: true

class ProblemCheck::UnsafeCsp < ProblemCheck
  self.priority = "low"

  def call
    return no_problem if !SiteSetting.encrypt_enabled?
    return no_problem if !SiteSetting.content_security_policy?
    return no_problem if safe_policy?

    problem
  end

  private

  def safe_policy?
    DiscourseEncrypt.safe_csp_src?(SiteSetting.content_security_policy_script_src)
  end

  def translation_key
    "site_settings.errors.encrypt_unsafe_csp"
  end
end

# frozen_string_literal: true

RSpec.describe ProblemCheck::UnsafeCsp do
  let(:check) { described_class.new }

  context "when encryption is not enabled" do
    before { SiteSetting.stubs(encrypt_enabled?: false) }

    it { expect(check).to be_chill_about_it }
  end

  context "when no CSP is configured" do
    before { SiteSetting.stubs(content_security_policy?: false) }

    it { expect(check).to be_chill_about_it }
  end

  context "when using a safe CSP configuration" do
    before do
      SiteSetting.stubs(encrypt_enabled?: true)
      SiteSetting.stubs(content_security_policy?: true)
      SiteSetting.stubs(content_security_policy_script_src: "script-src")
    end

    it { expect(check).to be_chill_about_it }
  end

  context "when using an unsafe CSP configuration" do
    before do
      SiteSetting.stubs(encrypt_enabled?: true)
      SiteSetting.stubs(content_security_policy?: true)
      SiteSetting.stubs(content_security_policy_script_src: "script-src 'unsafe-inline'")
    end

    it do
      expect(check).to have_a_problem.with_priority("low").with_message(
        "Unsafe CSP directives like 'unsafe-eval' and 'unsafe-inline' cannot be used when the Discourse Encrypt plugin is enabled.",
      )
    end
  end
end

# frozen_string_literal: true

require "rails_helper"

describe User do
  let(:user) { Fabricate(:user) }

  before { SiteSetting.encrypt_enabled = true }

  describe "user option #encrypt_pms_default" do
    it "disabled by default" do
      expect(user.user_option.encrypt_pms_default).to eq(false)
    end

    it "enabled if site setting value is true" do
      SiteSetting.encrypt_pms_default = true
      expect(user.user_option.encrypt_pms_default).to eq(true)
    end
  end
end

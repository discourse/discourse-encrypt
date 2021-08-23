# frozen_string_literal: true

require 'rails_helper'

describe DiscourseEncrypt::SiteSettingExtensions do
  let!(:default_extensions) { SiteSetting.authorized_extensions.split("|").reject { |x| x == "encrypted" } }

  it "adds 'encrypted' extensions to authorized_extensions" do
    expect(SiteSetting.authorized_extensions.split("|")).to match_array(default_extensions + ["encrypted"])
  end

  it "does not add 'encrypted' extensions if * is present" do
    SiteSetting.authorized_extensions = "*"
    expect(SiteSetting.authorized_extensions.split("|")).to match_array(["*"])
  end

  it "provider does not save 'encrypted' file extensions" do
    SiteSetting.authorized_extensions += "|txt"
    expect(SiteSetting.authorized_extensions.split("|")).to match_array(default_extensions + ["txt", "encrypted"])
    expect(SiteSetting.provider.find(:authorized_extensions)&.value.split("|")).to match_array(default_extensions + ["txt"])
  end
end

# frozen_string_literal: true

require 'rails_helper'

describe SiteSettingExtensions do
  let(:default_extensions) { ["jpg", "jpeg", "png", "gif", "heic", "heif"] }
  let(:encrypted_extensions) { default_extensions.map { |e| e + ".encrypted" } }
  let(:all_extensions) { default_extensions + encrypted_extensions }

  it "adds .encrypted file extensions to default authorized_extensions (getter)" do
    expect(SiteSetting.authorized_extensions.split("|")).to match_array(all_extensions)
  end

  it "provider does not save .encrypted file extensions" do
    SiteSetting.authorized_extensions += "|txt"
    expect(SiteSetting.authorized_extensions.split("|")).to match_array(all_extensions + ["txt", "txt.encrypted"])
    expect(SiteSetting.provider.find(:authorized_extensions)&.value.split("|")).to match_array(default_extensions + ["txt"])
  end
end

# frozen_string_literal: true

require 'rails_helper'

describe ::DiscourseEncrypt do
  let(:upload) { Fabricate(:upload) }
  let(:post) { Fabricate(:encrypt_post) }

  it 'links uploads in encrypted posts' do
    Jobs.run_immediately!

    post.update!(raw: "#{post.raw}\n[](#{upload.short_url})")
    post.rebake!

    expect(post.post_uploads.size).to eq(1)
    expect(post.post_uploads.first.upload).to eq(upload)
  end

  it 'cannot enable encrypt if unsafe CSP' do
    SiteSetting.encrypt_enabled = false # plugin is enabled by default
    SiteSetting.content_security_policy_script_src = "'unsafe-eval'|'unsafe-inline'"
    expect { SiteSetting.encrypt_enabled = true }.to raise_error(Discourse::InvalidParameters)
  end

  it 'cannot have unsafe CSP if encrypt is enabled' do
    SiteSetting.encrypt_enabled = true
    expect { SiteSetting.content_security_policy_script_src = "'unsafe-eval'|'unsafe-inline'" }.to raise_error(Discourse::InvalidParameters)
  end
end

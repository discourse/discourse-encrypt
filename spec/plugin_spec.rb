# frozen_string_literal: true

require 'rails_helper'

describe ::DiscourseEncrypt do
  let(:upload) { Fabricate(:upload) }
  let(:post) { Fabricate(:encrypt_post) }

  it 'registers current user fields' do
    expect(DiscoursePluginRegistry.serialized_current_user_fields)
      .to include(DiscourseEncrypt::PUBLIC_CUSTOM_FIELD, DiscourseEncrypt::PRIVATE_CUSTOM_FIELD)
  end

  it 'registers preloaded custom fields' do
    expect(CategoryList.preloaded_topic_custom_fields).to include(DiscourseEncrypt::TITLE_CUSTOM_FIELD)
    expect(TopicList.preloaded_custom_fields).to include(DiscourseEncrypt::TITLE_CUSTOM_FIELD)
  end

  it 'links uploads in encrypted posts' do
    Jobs.run_immediately!

    post.update!(raw: "#{post.raw}\n[](#{upload.short_url})")
    post.rebake!

    expect(post.post_uploads.size).to eq(1)
    expect(post.post_uploads.first.upload).to eq(upload)
  end
end

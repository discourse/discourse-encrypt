# frozen_string_literal: true

require 'rails_helper'

describe ::DiscourseEncrypt do
  it 'registers current user fields' do
    expect(DiscoursePluginRegistry.serialized_current_user_fields)
      .to include(DiscourseEncrypt::PUBLIC_CUSTOM_FIELD, DiscourseEncrypt::PRIVATE_CUSTOM_FIELD)
  end

  it 'registers preloaded custom fields' do
    expect(CategoryList.preloaded_topic_custom_fields).to include(DiscourseEncrypt::TITLE_CUSTOM_FIELD)
    expect(TopicList.preloaded_custom_fields).to include(DiscourseEncrypt::TITLE_CUSTOM_FIELD)
  end
end

require 'rails_helper'

describe ::DiscourseEncrypt do

  it 'registers current user fields' do
    expect(DiscoursePluginRegistry.serialized_current_user_fields).to include('encrypt_public_key', 'encrypt_private_key', 'encrypt_salt')
  end

  it 'registers preloaded custom fields' do
    expect(CategoryList.preloaded_topic_custom_fields).to include('encrypted_title')
    expect(TopicList.preloaded_custom_fields).to include('encrypted_title')
  end

end

# frozen_string_literal: true

require 'rails_helper'

describe BasicTopicSerializer do

  let(:store) { PluginStore.new('discourse-encrypt') }

  let(:user) { Fabricate(:user) }

  let(:topic) { Fabricate(:private_message_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }
  let(:unencrypted_topic) { Fabricate(:private_message_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }

  before do
    topic.custom_fields['encrypted_title'] = '-- the encrypted title --'
    topic.save!

    store.set("key_#{topic.id}_#{user.id}", '-- the key of user --')
  end

  it 'does not contain encrypted fields when scope is missing' do
    serialized = described_class.new(topic, root: false).as_json

    expect(serialized[:encrypted_title]).to eq(nil)
    expect(serialized[:topic_key]).to eq(nil)
  end

end

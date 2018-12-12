require 'rails_helper'

describe TopicViewSerializer do

  let(:store) { PluginStore.new('discourse-encrypt') }

  let(:user) { Fabricate(:user) }

  let(:topic) { Fabricate(:private_message_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }
  let(:topic_view) { TopicView.new(topic.id, user) }

  let(:unencrypted_topic) { Fabricate(:private_message_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }
  let(:unencrypted_topic_view) { TopicView.new(unencrypted_topic.id, user) }

  before do
    topic.custom_fields['encrypted_title'] = '-- the encrypted title --'
    topic.save!

    store.set("key_#{topic.id}_#{user.id}", '-- the key of user --')
  end

  it 'contains encrypted fields only for encrypted topics' do
    serialized = described_class.new(topic_view, scope: Guardian.new(user), root: false).as_json
    expect(serialized[:encrypted_title]).to eq('-- the encrypted title --')
    expect(serialized[:topic_key]).to eq('-- the key of user --')

    serialized = described_class.new(unencrypted_topic_view, scope: Guardian.new(user), root: false).as_json
    expect(serialized[:encrypted_title]).to eq(nil)
    expect(serialized[:topic_key]).to eq(nil)

    serialized = described_class.new(topic_view, scope: Guardian.new, root: false).as_json
    expect(serialized[:encrypted_title]).to eq(nil)
    expect(serialized[:topic_key]).to eq(nil)
  end

end

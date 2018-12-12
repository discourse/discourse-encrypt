require 'rails_helper'

[BasicTopicSerializer, ListableTopicSerializer, TopicListItemSerializer].each do |klass|

  describe klass do

    let(:store) { PluginStore.new('discourse-encrypt') }

    let(:user) { Fabricate(:user) }

    let(:topic) { Fabricate(:private_message_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }
    let(:unencrypted_topic) { Fabricate(:private_message_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }

    before do
      topic.custom_fields['encrypted_title'] = '-- the encrypted title --'
      topic.save!

      store.set("key_#{topic.id}_#{user.id}", '-- the key of user --')
    end

    it 'contains encrypted fields only for encrypted topics' do
      serialized = described_class.new(topic, scope: Guardian.new(user), root: false).as_json
      expect(serialized[:encrypted_title]).to eq('-- the encrypted title --')
      expect(serialized[:topic_key]).to eq('-- the key of user --')

      serialized = described_class.new(unencrypted_topic, scope: Guardian.new(user), root: false).as_json
      expect(serialized[:encrypted_title]).to eq(nil)
      expect(serialized[:topic_key]).to eq(nil)

      serialized = described_class.new(topic, scope: Guardian.new, root: false).as_json
      expect(serialized[:encrypted_title]).to eq(nil)
      expect(serialized[:topic_key]).to eq(nil)
    end

  end

end

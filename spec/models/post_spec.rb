# frozen_string_literal: true

require 'rails_helper'

describe Post do

  let(:user) { Fabricate(:user) }

  let(:topic) { Fabricate(:private_message_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }
  let(:post) { Fabricate(:post, topic: topic, user: user) }

  let(:topic2) { Fabricate(:private_message_topic, topic_allowed_users: [ Fabricate.build(:topic_allowed_user, user: user) ]) }
  let(:post2) { Fabricate(:post, topic: topic2, user: user) }

  before do
    topic.custom_fields['encrypted_title'] = '-- the encrypted title --'
    topic.save!

    SiteSetting.editing_grace_period_max_diff = 1

    revisor = PostRevisor.new(post)
    revisor.revise!(user, raw: 'base64')
  end

  context '#is_encrypted?' do
    it 'works' do
      expect(post.is_encrypted?).to eq(true)
    end
  end

end

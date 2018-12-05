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
    revisor.revise!(user, raw: 'this post is encrypted and has been edited')

    revisor = PostRevisor.new(post2)
    revisor.revise!(user, raw: 'this post is unencrypted and has been edited')
  end

  it 'hides version for encrypted posts' do
    expect(post.version).to eq(1)
    expect(post.public_version).to eq(1)
  end

  it 'shows real version for unencrypted posts' do
    expect(post2.version).to eq(2)
    expect(post2.public_version).to eq(2)
  end

end

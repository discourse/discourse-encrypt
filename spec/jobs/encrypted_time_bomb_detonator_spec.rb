# frozen_string_literal: true

require 'rails_helper'

describe Jobs::EncryptedTimeBombDetonator do
  fab!(:topic) { Fabricate(:encrypt_topic) }
  fab!(:post1) { Fabricate(:encrypt_post, topic: topic) }
  fab!(:post2) { Fabricate(:encrypt_post, topic: topic) }
  fab!(:post3) { Fabricate(:encrypt_post, topic: topic) }

  context 'explosion of first post' do
    it 'when time is right, delete all posts' do
      encrypted_time_bomb = EncryptedTimeBomb.create!(post: post1, detonate_at: 1.hour.from_now)
      described_class.execute({})
      expect(post1.reload.persisted?).to be true
      expect(post2.reload.persisted?).to be true
      expect(post3.reload.persisted?).to be true
      expect(topic.reload.persisted?).to be true
      expect(encrypted_time_bomb.reload.exploded_at).to be nil

      freeze_time 61.minutes.from_now
      described_class.execute({})
      expect { post1.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { post2.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { post3.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { topic.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect(encrypted_time_bomb.reload.exploded_at).not_to be nil
    end
  end

  context 'explosion of consecutive posts' do
    it 'when time is right, delete only one post' do
      encrypted_time_bomb = EncryptedTimeBomb.create!(post: post2, detonate_at: 1.hour.from_now)
      described_class.execute({})
      expect(post1.reload.persisted?).to be true
      expect(post2.reload.persisted?).to be true
      expect(post3.reload.persisted?).to be true
      expect(encrypted_time_bomb.reload.exploded_at).to be nil

      freeze_time 61.minutes.from_now
      described_class.execute({})
      expect(post1.reload.persisted?).to be true
      expect { post2.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect(post3.reload.persisted?).to be true
      expect(topic.reload.persisted?).to be true
      expect(encrypted_time_bomb.reload.exploded_at).not_to be nil
    end
  end
end

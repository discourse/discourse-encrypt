# frozen_string_literal: true

require 'rails_helper'

describe EncryptedPostCreator do
  let(:user) { Fabricate(:user) }
  let(:topic) { Fabricate(:topic) }

  let(:destination_user) do
    Fabricate(:user).tap do |user|
      public_key = <<EOS
1$eyJlbmNyeXB0UHVibGljIjp7ImFsZyI6IlJTQS1PQUVQLTI1NiIsImUiOiJBUUFCIiwiZXh0Ijp0cnVlLCJrZXlfb3BzIjpbImVuY3J5cHQiLCJ3cmFwS2V5Il0sImt0eSI6IlJTQSIsIm4iOiIzY3Nn
NWN4ZFJ4SUF6c041dk5EckwteExvNjRCSkNLM25KeGF5NHV1U280SEpYSzVyT2VZbjBueTdkUmc1LUlKT1ZxS0tNTXF4c2JVT0xyang3WkFDZU50Y2Qyc3NSaXo1UWNiaTU4Nl9jc0hrRldZOFpMd0Y2Vk
JJWGxONlZpdHVqWkU4cDlVVjZIR2J6RjBqYjZfRWhkSlNQb3lWR3R5N3Naem9mSTktdGc0ZDFKcHhkWmxMODJ6WVpONEl1a2N6Tkc3NjVfcjNYb1RyYlVEOFBqc0Mxa1hPZnRPTjBtU2tNSUZjQlFHY0M5
aURQSWRNQ2VKTkhfUTh6SHVZeGJPTzc2enV0M05Vb2I1NU9jdnBULThkTUo3UzhjVk5aZGpWZk15VWZjX1dEMklqWXMybXk3U05aeS1HaENYdEZRRlRhZzVRcHV0b2VDbDhaVHhiQmc2cmQzRkl5WldNSX
NycThPOGxZbF9HeEc4UC1rXzVxYkk1cFJ0NFVKS0h4SkpSM05FWDctNHR1ajhkRlpsa0J6Zy1jdGNfV2YwZHlpWGZlNW5sY2NUdXhJWnZRWVU1Q3lVbUdVb3MxbkNVeWp1RzIyUEZGRnE2a2o3LUxuUlph
Zm85OXBOVklTdGQtUlJCcmU2YkVoai1DajlhTk0wTVktNjVxT25DSHdYTF9ydmlxWnM1Q1hGMXVoVmtMZUNHWWFCWF9OcmJvQWYweXZOY1E3Ri1XVEJxR1J5eVoyMFh0eW9yck1kbmZHdThhNnBic3dvN1
lKSnIxeWxNaUdrOW9HZHlabDY1cmtlQnFDRWNzVlVFTk9GYUVVZHhFYmhqaWlBMk9GYVQxVkJlT2RhMzNscmtnWmlEUVFud1g5T0JjeEQtZlI0aGhuN0NBb0RZRDdRckp4QWVqMCJ9LCJzaWduUHVibGlj
Ijp7ImFsZyI6IlBTMjU2IiwiZSI6IkFRQUIiLCJleHQiOnRydWUsImtleV9vcHMiOlsidmVyaWZ5Il0sImt0eSI6IlJTQSIsIm4iOiI0SDFJbVEwaC1uOXZCLWNmQjNRNmVZV0pDRkUzbm9jeVBYUWhhZz
N5VTFCMzU5ajNhQkw4VXBScVJqNE9Xb3Z2SG40REVyZExDVTFYdHFMR0t0bjFVUkc4TmV2aHBBQVFKS0ZlWjRwemRSTDFRWjBvSHQyRDhPcEl5VEVid09jSEtwMVBKZkdQTWs5NDB1Wm50aVRCQzA2T2Fm
MWRpcFB4eGpXT2lGRFhGcUF0SkozQTRNWldoUGU3c3VVOEJjMG8wMkR5Wmsxa0pfU1p0RnJUSW5GVlpITnlsQ1A0R0d5azlUakdoTkRoSVV1QTFZVUstVDl1aG5GSnVFdUxySWZPenJ4M3pEMXMwYTRtTV
lIQkZobENuTFBneS1PT1MxQl8tY0RFeUpFbjQ1M2Jra3phd0NmOEJQNEJ5ODhjMVhyeXEwdmduamNqRTFQZ2dITDNDR2U0QVRNVEVPSmloSlkyTGN2VjdNNzRLeXR1WXV3OS1xMjA4VWpCMDM0YnlRX182
OXoyQnhXUlIwemdmdWNuODFjSEdVd0RCa0cxVWZuWF9qTkFyX3BNdE9OaWpsZ25nbjdrX2dibi14MVFLWFlPVjhQTUp6RXNSMTA4SmR6V1FsalEzVV9rZVZEYy1FX0VKRGp6ZHhST1Y1SHE1Wi1FYktzOW
9rZ0RjWUxnc2pQLTZKNjRUMklMX01QRW9hdnltMmtqQVFNZXlWZzZOc1dJN0RRTmNfU0RFLUw2bjdHWnBKdER6ZkI2b1hNOHE1TlRKMV8zcXZCUENCRzljMjJTZWs3c0s5c09zeEFxRGZ3aU5vU2NLR3Jf
aHRWSTZKQlYwU2xueVJPSDJsWVFwX0FEc3paakN4X2tDdjNGTmlMR1FlUkRDUmtpWHlqX0c0Skhnb0tSeDFDLWV5MCJ9fQ==
EOS
      UserEncryptionKey.create!(user: user, encrypt_public: public_key)
    end
  end

  context '#create_encrypted' do
    it 'ensures archetype is private message' do
      creator = described_class.new(user, raw: 'Hello world!')
      post = creator.create

      expect(post).to eq(nil)
      expect(creator.errors.count).to eq(1)
      expect(creator.errors.messages[:base][0]).to eq(I18n.t('encrypt.only_pms'))
    end

    it 'ensures topic is private message' do
      creator = described_class.new(user, raw: 'Hello world!', topic: topic)
      post = creator.create

      expect(post).to eq(nil)
      expect(creator.errors.count).to eq(1)
      expect(creator.errors.messages[:base][0]).to eq(I18n.t('encrypt.only_pms'))
    end

    it 'encrypts title and raw' do
      creator = described_class.new(user,
        title: 'Hello world!',
        raw: 'Hello world!',
        target_usernames: destination_user.username,
        archetype: Archetype.private_message
      )
      post = creator.create

      expect(creator.errors.count).to eq(0)
      expect(creator.opts[:title]).to eq(I18n.t('js.encrypt.encrypted_topic_title'))
      expect(creator.opts[:raw]).not_to eq('Hello world!')

      expect(post.topic.is_encrypted?).to eq(true)
      expect(post.topic.title).to eq(I18n.t('js.encrypt.encrypted_topic_title'))
      expect(post.topic.encrypted_topics_title.title).not_to eq(nil)
      expect(post.is_encrypted?).to eq(true)
      expect(post.raw).not_to eq('Hello world!')
    end
  end
end

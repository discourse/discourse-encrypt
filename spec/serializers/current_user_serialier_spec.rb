# frozen_string_literal: true

require 'rails_helper'

describe CurrentUserSerializer do
  let(:user) { Fabricate(:user) }

  it 'contains public, private key and encrypt_pms_default' do
    UserEncryptionKey.create!(user_id: user.id, encrypt_public: "public key", encrypt_private: "private key")
    SiteSetting.encrypt_pms_default = true
    serialized = described_class.new(user, scope: Guardian.new(user), root: false).as_json
    expect(serialized[:encrypt_public]).to eq("public key")
    expect(serialized[:encrypt_private]).to eq("private key")
    expect(serialized[:encrypt_pms_default]).to be true
  end

  it 'use SiteSetting as default when encrypt_pms_default is not set' do
    user.user_option.update!(encrypt_pms_default: nil)
    UserEncryptionKey.create!(user_id: user.id, encrypt_public: "public key", encrypt_private: "private key")
    serialized = described_class.new(user, scope: Guardian.new(user), root: false).as_json
    expect(serialized[:encrypt_pms_default]).to be false
  end
end

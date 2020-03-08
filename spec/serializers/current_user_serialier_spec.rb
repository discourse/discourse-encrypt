# frozen_string_literal: true

require 'rails_helper'

describe CurrentUserSerializer do
  let(:user) { Fabricate(:user) }

  it 'contains public and private key' do
    UserEncryptionKey.create!(user_id: user.id, encrypt_public: "public key", encrypt_private: "private key")
    serialized = described_class.new(user, scope: Guardian.new(user), root: false).as_json
    expect(serialized[:encrypt_public]).to eq("public key")
    expect(serialized[:encrypt_private]).to eq("private key")
  end
end

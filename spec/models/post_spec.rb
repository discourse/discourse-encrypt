# frozen_string_literal: true

require 'rails_helper'

describe Post do
  let(:post) { Fabricate(:post) }
  let(:encrypt_user) { Fabricate(:encrypt_user) }
  let(:encrypt_post) { Fabricate(:encrypt_post, user: encrypt_user) }

  context '#ciphertext' do
    it 'works' do
      ciphertext = "0$ciphertextbase64encoded=="
      encrypt_post.update!(raw: "#{ciphertext}\nmetadata maybe?")

      expect(encrypt_post.ciphertext).to eq(ciphertext)
    end
  end

  context '#is_encrypted?' do
    it 'works' do
      expect(post.is_encrypted?).to eq(false)
      expect(encrypt_post.is_encrypted?).to eq(true)
    end
  end
end

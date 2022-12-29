# frozen_string_literal: true

require "rails_helper"

describe PostsController do
  let(:encrypt_post) { Fabricate(:encrypt_post) }
  let(:user) { Fabricate(:user) }
  let(:group) { Fabricate(:group) }

  before { sign_in(Fabricate(:admin)) }

  describe "#create" do
    it "works" do
      post "/posts.json",
           params: {
             raw: I18n.t("js.encrypt.encrypted_post"),
             title: I18n.t("js.encrypt.encrypted_title"),
             archetype: Archetype.private_message,
             target_recipients: user.username,
             draft_key: Draft::NEW_TOPIC,
             is_encrypted: true,
             encrypted_title: "1$title",
             encrypted_raw: encrypt_post.raw,
             encrypted_keys: "{\"#{user.username}\":\"topickey\"}",
           }

      expect(response.status).to eq(200)
    end

    it "raises an error" do
      post "/posts.json",
           params: {
             raw: I18n.t("js.encrypt.encrypted_post"),
             title: I18n.t("js.encrypt.encrypted_title"),
             archetype: Archetype.private_message,
             target_recipients: user.username,
             draft_key: Draft::NEW_TOPIC,
             is_encrypted: true,
             encrypted_title: "1$title",
             encrypted_raw: encrypt_post.raw,
           }

      expect(response.status).to eq(422)
      expect(JSON.parse(response.body)["errors"]).to include(I18n.t("encrypt.no_encrypt_keys"))
    end
  end
end

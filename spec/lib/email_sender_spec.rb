# frozen_string_literal: true

require 'rails_helper'

describe Email::Sender do
  fab!(:small_pdf) do
    SiteSetting.authorized_extensions = 'pdf'
    UploadCreator.new(file_from_fixtures("small.pdf", "pdf"), "small.pdf")
      .create_for(Discourse.system_user.id)
  end

  context "encrypted" do
    fab!(:encrypted_topic) { Fabricate(:encrypt_topic) }
    fab!(:encrypted_post) { Fabricate(:encrypt_post, topic: encrypted_topic) }
    fab!(:encrypted_reply) do
      raw = <<~RAW
      0$ciphertextbase64encoded==
      Hello world!
      #{UploadMarkdown.new(small_pdf).attachment_markdown}
      RAW
      reply = Fabricate(:encrypt_post, raw: raw, topic: encrypted_post.topic, user: Fabricate(:user))
      reply.link_post_uploads
      reply
    end
    fab!(:notification) { Fabricate(:posted_notification, user: encrypted_post.user, post: encrypted_reply) }
    let(:message) do
      UserNotifications.user_posted(
        encrypted_post.user,
        post: encrypted_reply,
        notification_type: notification.notification_type,
        notification_data_hash: notification.data_hash
      )
    end

    it "removes attachments from the email" do
      SiteSetting.email_total_attachment_size_limit_kb = 10_000
      Email::Sender.new(message, :valid_type).send

      expect(message.attachments.length).to eq(0)
    end
  end

  context "plain post" do
    fab!(:post) { Fabricate(:post) }
    fab!(:reply) do
      raw = <<~RAW
      Hello world!
      #{UploadMarkdown.new(small_pdf).attachment_markdown}
      RAW
      reply = Fabricate(:post, raw: raw, topic: post.topic, user: Fabricate(:user))
      reply.link_post_uploads
      reply
    end
    fab!(:notification) { Fabricate(:posted_notification, user: post.user, post: reply) }
    let(:message) do
      UserNotifications.user_posted(
        post.user,
        post: reply,
        notification_type: notification.notification_type,
        notification_data_hash: notification.data_hash
      )
    end

    it "adds non-image uploads as attachments to the email" do
      SiteSetting.email_total_attachment_size_limit_kb = 10_000
      Email::Sender.new(message, :valid_type).send

      expect(message.attachments.length).to eq(1)
    end
  end
end

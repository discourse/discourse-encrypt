# frozen_string_literal: true

require 'rails_helper'

describe Email::Sender do
  before do
    POP3PollingEnabledSettingValidator.any_instance.stubs(:authentication_works?).returns(true)
    SiteSetting.pop3_polling_host = "localhost"
    SiteSetting.pop3_polling_username = "test"
    SiteSetting.pop3_polling_password = "test"
    SiteSetting.pop3_polling_enabled = true
    SiteSetting.reply_by_email_address = "test+%{reply_key}@example.com"
    SiteSetting.reply_by_email_enabled = true
  end

  fab!(:small_pdf) do
    SiteSetting.authorized_extensions = 'pdf'
    UploadCreator.new(file_from_fixtures("small.pdf", "pdf"), "small.pdf")
      .create_for(Discourse.system_user.id)
  end

  fab!(:user) { Fabricate(:user) }

  before do
    user.user_option.update!(email_in_reply_to: true,
                             email_previous_replies: UserOption.previous_replies_type[:always])
  end

  context "when encrypted" do
    fab!(:encrypted_topic) { Fabricate(:encrypt_topic) }
    fab!(:encrypted_post) { Fabricate(:encrypt_post, topic: encrypted_topic) }
    fab!(:encrypted_reply) do
      raw = <<~RAW
      0$ciphertextbase64encoded==
      Hello world!
      #{UploadMarkdown.new(small_pdf).attachment_markdown}
      RAW
      reply = Fabricate(:encrypt_post,
                        raw: raw,
                        topic: encrypted_post.topic,
                        user: Fabricate(:user),
                        reply_to_post_number: encrypted_post.post_number)
      reply.link_post_uploads
      reply
    end
    fab!(:notification) { Fabricate(:posted_notification, user: encrypted_post.user, post: encrypted_reply) }
    let(:message) do
      UserNotifications.user_replied(
        user,
        post: encrypted_reply,
        notification_type: notification.notification_type,
        notification_data_hash: notification.data_hash
      )
    end

    it "removes attachments from the email, does not allow to respond via email and adds topic id to subject" do
      SiteSetting.email_total_attachment_size_limit_kb = 10_000
      Email::Sender.new(message, :valid_type).send

      expect(message.attachments.length).to eq(0)
      expect(message.reply_to).to eq(["noreply@test.localhost"])
      expect(message.body.raw_source).not_to match("or reply to this email to respond")
      expect(message.subject).to match("[Discourse] [PM] A secret message ##{encrypted_topic.id}")
      renderer = Email::Renderer.new(message, {})
      expect(renderer.html).not_to match("In Reply To")
      expect(renderer.html).not_to match("Previous Replies")
    end
  end

  context "with plain post" do
    fab!(:post) { Fabricate(:post) }
    fab!(:reply) do
      raw = <<~RAW
      Hello world!
      #{UploadMarkdown.new(small_pdf).attachment_markdown}
      RAW
      reply = Fabricate(:post,
                        raw: raw,
                        topic: post.topic,
                        user: Fabricate(:user),
                        reply_to_post_number: post.post_number)
      reply.link_post_uploads
      reply
    end
    fab!(:notification) { Fabricate(:posted_notification, user: post.user, post: reply) }
    let(:message) do
      UserNotifications.user_replied(
        user,
        post: reply,
        notification_type: notification.notification_type,
        notification_data_hash: notification.data_hash
      )
    end

    it "adds non-image uploads as attachments to the email and allows to respond via email" do
      SiteSetting.email_total_attachment_size_limit_kb = 10_000
      Email::Sender.new(message, :valid_type).send

      expect(message.attachments.length).to eq(1)
      expect(message.reply_to).to eq(["test+%{reply_key}@example.com"])
      expect(message.body.raw_source).to match("or reply to this email to respond")
      expect(message.subject).to match("[Discourse] #{post.topic.title}")
      renderer = Email::Renderer.new(message, {})
      expect(renderer.html).to match("In Reply To")
      expect(renderer.html).to match("Previous Replies")
    end
  end
end

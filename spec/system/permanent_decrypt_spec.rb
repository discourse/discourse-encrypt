# frozen_string_literal: true

describe "Encrypt | Decypting topic posts", type: :system do
  fab!(:current_user) { Fabricate(:user) }
  fab!(:category) { Fabricate(:category, name: "TODO", slug: "todo") }
  fab!(:tag) { Fabricate(:tag, name: "bugs") }
  fab!(:other_user) { Fabricate(:user) }

  let(:topic_page) { PageObjects::Pages::Topic.new }
  let(:composer) { PageObjects::Components::Composer.new }
  let(:topic_title) { "My super secret topic" }
  let(:user_preferences_page) { PageObjects::Pages::UserPreferences.new }

  before do
    SiteSetting.allow_decrypting_pms = true
    encrypt_system_bootstrap(current_user)
    sign_in(current_user)
    enable_encrypt_with_keys_for_user(current_user)
    activate_encrypt(user_preferences_page, current_user)
  end

  def select_recipient(username)
    find("#private-message-users").click
    find("#private-message-users-filter input[name='filter-input-search']").send_keys(username)
    find(".email-group-user-chooser-row").click
    find("#private-message-users").click
  end

  it "can permanently decrypt the topic" do
    Jobs.run_immediately!

    topic_page.open_new_message
    expect(page).to have_css(".encrypt-controls .d-icon-lock")

    enable_encrypt_for_user_in_session(other_user, user_preferences_page)
    select_recipient(other_user.username)

    # Create encrypted PM
    topic_page.fill_in_composer_title(topic_title)
    topic_page.fill_in_composer("This is an initial post in the encrypted PM")
    topic_page.send_reply

    # Check it worked
    expect(find(".fancy-title")).to have_content(topic_title)
    expect(page).to have_css(".topic-status .d-icon-user-secret")
    expect(find("#post_1")).to have_content("This is an initial post in the encrypted PM")

    # Reply from other user
    using_session("user_#{other_user.username}_enable_encrypt") do
      visit "/t/#{Topic.last.id}"
      topic_page.click_reply_button
      topic_page.fill_in_composer("Reply from other user")
      topic_page.send_reply
      expect(find("#post_2")).to have_content("Reply from other user")
    end

    # Final reply from initial user, with uploads
    topic_page.click_reply_button
    topic_page.fill_in_composer("This is a reply to the encrypted PM")
    attach_file(file_from_fixtures("logo.png", "images").path) do
      composer.click_toolbar_button("upload")
    end
    expect(page).to have_no_css("#file-uploading")
    topic_page.send_reply

    expect(find("#post_3")).to have_content("This is a reply to the encrypted PM")

    try_until_success do
      upload = Topic.last.posts.last.uploads.first
      expect(upload).to be_present
      expect(upload.url).to end_with(".encrypted")
    end

    initial_bump_date = Topic.last.bumped_at
    initial_notification_count = Notification.count

    # Permanently decrypt the topic
    find(".decrypt-topic-button").click
    expect(page).to have_css(".decrypt-topic-modal")
    find(".d-modal__footer .btn-primary").click
    expect(find(".d-modal__body")).to have_content("Refresh page to continue")
    find(".d-modal__footer .btn-primary").click

    # Check the topic is decrypted
    expect(page).not_to have_css("body.encrypted-topic-page")
    expect(page).to have_css(".private-message-glyph")
    expect(find("#post_1")).to have_content("This is an initial post in the encrypted PM")
    expect(find("#post_2")).to have_content("Reply from other user")
    expect(find("#post_3")).to have_content("This is a reply to the encrypted PM")

    # Check database state is good
    expect(Topic.last.is_encrypted?).to eq(false)
    upload = Topic.last.posts.last.uploads.first
    expect(upload).to be_present
    expect(upload.url).not_to end_with(".encrypted")
    expect(Topic.last.bumped_at).to eq(initial_bump_date) # rubocop:disable Discourse/TimeEqMatcher because it should be precisely the same
    expect(Notification.count).to eq(initial_notification_count)
  end

  it "can permanently decrypt multiple topics" do
    3.times do |i|
      topic_page.open_new_message
      expect(page).to have_css(".encrypt-controls .d-icon-lock")
      select_recipient(current_user.username)

      # Create encrypted PM
      topic_page.fill_in_composer_title(topic_title)
      topic_page.fill_in_composer("This is an initial post in the encrypted PM")
      if i == 0
        attach_file(file_from_fixtures("logo.png", "images").path) do
          composer.click_toolbar_button("upload")
        end
        expect(page).to have_no_css("#file-uploading")
      end

      topic_page.send_reply
      expect(find(".fancy-title")).to have_content(topic_title)
    end

    visit "/my/preferences/security"
    find("#encrypt-preferences-header").click
    find("[data-value='decryptAll']").click

    expect(find(".d-modal__body")).to have_content(
      I18n.t("js.encrypt.decrypt_all.modal_count", count: 3),
    )

    find(".d-modal__footer .btn-primary").click

    expect(find(".d-modal__body")).to have_content("✅", count: 3)

    expect(Topic.last(3).map(&:is_encrypted?)).to eq([false, false, false])
  end
end

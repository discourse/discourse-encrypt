# frozen_string_literal: true

describe "Encrypt | Decypting topic posts", type: :system, js: true do
  fab!(:current_user) { Fabricate(:user) }

  let(:user_preferences_page) { PageObjects::Pages::UserPreferences.new }
  let(:topic_title) { "This is a new topic for encryption" }

  before do
    encrypt_system_bootstrap(current_user)
    sign_in(current_user)
    enable_encrypt_with_keys_for_user(current_user)
    activate_encrypt(user_preferences_page, current_user)
  end

  describe "with hashtags" do
    fab!(:category) { Fabricate(:category, name: "TODO", slug: "todo") }
    fab!(:tag) { Fabricate(:tag, name: "bugs") }
    fab!(:other_user) { Fabricate(:user, username: "otherguy") }
    let!(:topic_page) { PageObjects::Pages::Topic.new }

    before { SiteSetting.enable_experimental_hashtag_autocomplete = true }

    it "decrypts the post" do
      using_session("otherguy_encrypt") do
        sign_in(other_user)
        enable_encrypt_with_keys_for_user(other_user, 2)
        activate_encrypt(user_preferences_page, other_user, 2)
      end

      visit "/new-message"
      expect(page).to have_css(".encrypt-controls .d-icon-lock")

      # select other user to send the message to (who has encryption enabled)
      find("#private-message-users").click
      find(
        "#private-message-users-filter input[name='filter-input-search']"
      ).send_keys("otherguy")
      find(".email-group-user-chooser-row").click

      # fill topic details in composer + create
      find("#reply-title").fill_in(with: topic_title)
      find("#reply-control .d-editor-input").fill_in(
        with: "Here are some hashtags for decryption later on #todo #bugs"
      )
      find("#reply-control .save-or-cancel .create").click

      # encryption loading and processing takes a little longer than usual
      using_wait_time(5) do
        expect(find(".fancy-title")).to have_content(topic_title)
        expect(page).to have_css(".d-icon-user-secret.private-message-glyph")
        expect(page).to have_content(
          "Here are some hashtags for decryption later"
        )
      end

      # make sure hashtags are rendered by the post decrypter
      expect(page).to have_css(".hashtag-cooked[data-slug='todo']")
      expect(page).to have_css(".hashtag-cooked[data-slug='bugs']")
    end
  end
end

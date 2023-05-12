# frozen_string_literal: true

describe "Encrypt | Decypting topic posts", type: :system, js: true do
  fab!(:current_user) { Fabricate(:user) }

  let(:user_preferences_page) { PageObjects::Pages::UserPreferences.new }
  let(:topic_page) { PageObjects::Pages::Topic.new }
  let(:topic_title) { "This is a new topic for encryption" }

  before do
    encrypt_system_bootstrap(current_user)
    sign_in(current_user)
    enable_encrypt_with_keys_for_user(current_user)
    activate_encrypt(user_preferences_page, current_user)
  end

  def select_other_user_for_pm
    find("#private-message-users").click
    find("#private-message-users-filter input[name='filter-input-search']").send_keys(
      other_user.username,
    )
    find(".email-group-user-chooser-row").click
  end

  describe "with hashtags" do
    fab!(:category) { Fabricate(:category, name: "TODO", slug: "todo") }
    fab!(:tag) { Fabricate(:tag, name: "bugs") }
    fab!(:other_user) { Fabricate(:user) }

    before { SiteSetting.enable_experimental_hashtag_autocomplete = true }

    xit "decrypts the post" do
      enable_encrypt_for_user_in_session(other_user, user_preferences_page)

      topic_page.open_new_message
      expect(page).to have_css(".encrypt-controls .d-icon-lock")

      select_other_user_for_pm

      topic_page.fill_in_composer_title(topic_title)
      topic_page.fill_in_composer("Here are some hashtags for decryption later on #todo #bugs")
      topic_page.send_reply

      # encryption loading and processing takes a little longer than usual
      using_wait_time(5) do
        expect(find(".fancy-title")).to have_content(topic_title)
        expect(page).to have_css(".d-icon-user-secret.private-message-glyph")
        expect(page).to have_content("Here are some hashtags for decryption later")
      end

      # make sure hashtags are rendered by the post decrypter
      expect(page).to have_css(".hashtag-cooked[data-slug='todo']")
      expect(page).to have_css(".hashtag-cooked[data-slug='bugs']")
    end
  end

  describe "with mentions" do
    fab!(:user_2) { Fabricate(:user) }
    fab!(:user_3) { Fabricate(:user) }
    fab!(:other_user) { Fabricate(:user) }

    xit "decrypts the post" do
      enable_encrypt_for_user_in_session(other_user, user_preferences_page)

      topic_page.open_new_message
      expect(page).to have_css(".encrypt-controls .d-icon-lock")

      select_other_user_for_pm

      topic_page.fill_in_composer_title(topic_title)
      topic_page.fill_in_composer(
        "Here are some mentions for decryption later on @#{user_2.username} @#{user_3.username}",
      )
      topic_page.send_reply

      # encryption loading and processing takes a little longer than usual
      using_wait_time(5) do
        expect(find(".fancy-title")).to have_content(topic_title)
        expect(page).to have_css(".d-icon-user-secret.private-message-glyph")
        expect(page).to have_content("Here are some mentions for decryption later")
      end

      # make sure mentions are rendered by the post decrypter
      expect(page).to have_css(".mention[href='/u/#{user_2.username}']")
      expect(page).to have_css(".mention[href='/u/#{user_3.username}']")
    end
  end
end

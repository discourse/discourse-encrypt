# frozen_string_literal: true

describe "Encrypt | Enabling encrypted messages", type: :system, js: true do
  fab!(:current_user) { Fabricate(:user) }
  before do
    encrypt_system_bootstrap(current_user)
    sign_in(current_user)
  end

  let(:user_preferences_page) { PageObjects::Pages::UserPreferences.new }

  it "shows warning about paper keys when encryption is enabled" do
    user_preferences_page.visit(current_user)
    click_link "Security"
    find("#enable-encrypted-messages").click
    using_wait_time(5) do
      expect(page).to have_content(I18n.t("js.encrypt.no_backup_warn")[0..100])
    end
    expect(current_user.reload.user_encryption_key.encrypt_public).not_to eq(
      nil
    )
    expect(current_user.reload.user_encryption_key.encrypt_private).to eq(nil)
  end

  it "enables encryption and generates paper keys" do
    user_preferences_page.visit(current_user)
    click_link "Security"
    find("#enable-encrypted-messages").click
    using_wait_time(5) do
      expect(page).to have_content(I18n.t("js.encrypt.no_backup_warn")[0..100])
    end
    expect(current_user.reload.user_encryption_key.encrypt_public).not_to eq(
      nil
    )
    find("#encrypt-generate-paper-key").click
    expect(page).to have_css(".generate-paper-key-modal .paper-key")
    paper_key = find(".generate-paper-key-modal .paper-key").text
    expect(paper_key).not_to eq(nil)
    try_until_success do
      expect(current_user.reload.user_encryption_key.encrypt_private).not_to eq(
        nil
      )
    end
  end

  it "activates encrypted messages on the device" do
    enable_encrypt_with_keys_for_user(current_user)
    user_preferences_page.visit(current_user)
    click_link "Security"
    expect(page).to have_content(
      I18n.t("js.encrypt.preferences.status_enabled_but_inactive")
    )
    find("#passphrase").fill_in(with: test_paper_key)
    find("#encrypt-activate").click
    expect(page).to have_content(
      I18n.t("js.encrypt.preferences.status_enabled")
    )
    expect(
      page.execute_script("return localStorage[\"discourse-encrypt\"]")
    ).to eq("true")
  end
end

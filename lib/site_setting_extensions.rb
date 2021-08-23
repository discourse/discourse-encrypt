# frozen_string_literal: true

module DiscourseEncrypt::SiteSettingExtensions
  def authorized_extensions
    original_extensions = super

    if SiteSetting.encrypt_enabled?
      if extensions = original_extensions.gsub(/[\s\.]+/, "").downcase.split("|")
        return (extensions << "encrypted").uniq.join("|") if !extensions.include?("*")
      end
    end

    original_extensions
  end

  def authorized_extensions=(extensions)
    super(extensions.split("|").reject { |ext| ext == "encrypted" }.join("|"))
  end
end

# frozen_string_literal: true

module SiteSettingExtensions
  def authorized_extensions
    original_extensions = super

    if extensions = original_extensions.split("|")
      if !extensions.include?("*")
        extensions.reject! { |ext| ext.ends_with?(".encrypted") }
        extensions += extensions.map { |ext| "#{ext}.encrypted" }

        return extensions.uniq.join("|")
      end
    end

    original_extensions
  end

  def authorized_extensions=(extensions)
    extensions = extensions
      .split("|")
      .reject { |ext| ext.ends_with?(".encrypted") }
      .join("|")

    super(extensions)
  end
end

# frozen_string_literal: true

module DiscourseEncrypt::UploadValidatorExtensions
  def validate(upload)
    extension = File.extname(upload.original_filename)[1..-1] || ""

    if extension == "encrypted"
      filename = upload.original_filename.gsub(/\.encrypted$/, "")
      extension = File.extname(filename)[1..-1] || ""

      if is_authorized?(upload, extension)
        if FileHelper.is_supported_image?(filename)
          authorized_image_extension(upload, extension)
          maximum_image_file_size(upload)
        else
          authorized_attachment_extension(upload, extension)
          maximum_attachment_file_size(upload)
        end
      end
    end

    super
  end
end

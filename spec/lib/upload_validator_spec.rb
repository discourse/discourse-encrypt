# frozen_string_literal: true

require "rails_helper"

describe DiscourseEncrypt::UploadValidatorExtensions do
  it "removes '.encrypted' extension and validates the real extension" do
    SiteSetting.authorized_extensions = "foo"

    expect { Fabricate(:upload, original_filename: "test.foo") }.not_to raise_exception
    expect { Fabricate(:upload, original_filename: "test.foo.encrypted") }.not_to raise_exception
    expect { Fabricate(:upload, original_filename: "test.bar") }.to raise_exception(
      ActiveRecord::RecordInvalid,
    )
    expect { Fabricate(:upload, original_filename: "test.bar.encrypted") }.to raise_exception(
      ActiveRecord::RecordInvalid,
    )

    SiteSetting.authorized_extensions = "*"

    expect { Fabricate(:upload, original_filename: "test.bar") }.not_to raise_exception
    expect { Fabricate(:upload, original_filename: "test.bar.encrypted") }.not_to raise_exception
  end

  it "removes '.encrypted' extension and validates the real image extension" do
    expect { Fabricate(:upload, original_filename: "test.jpg") }.not_to raise_exception
    expect { Fabricate(:upload, original_filename: "test.jpg.encrypted") }.not_to raise_exception
  end
end

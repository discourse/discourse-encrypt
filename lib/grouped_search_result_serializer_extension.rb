# frozen_string_literal: true

module DiscourseEncrypt::GroupedSearchResultSerializerExtension
  def self.prepended(base)
    base.attributes :type_filter
  end
end

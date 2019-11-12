# frozen_string_literal: true

module TopicsControllerExtensions
  def update
    @topic ||= Topic.find_by(id: params[:topic_id])

    if @topic.is_encrypted? && encrypted_title = params[:encrypted_title].presence
      guardian.ensure_can_edit!(@topic)
      @topic.custom_fields[DiscourseEncrypt::TITLE_CUSTOM_FIELD] = params.delete(:encrypted_title)
      @topic.save_custom_fields
    end

    super
  end

  def invite
    @topic ||= Topic.find_by(id: params[:topic_id])

    if @topic.is_encrypted?
      if params[:key].present?
        @user ||= User.find_by_username_or_email(params[:user])
        guardian.ensure_can_invite_to!(@topic)
        DiscourseEncrypt::set_key(@topic.id, @user.id, params[:key])
      else
        return render_json_error(I18n.t("js.encrypt.cannot_invite"))
      end
    end

    super
  end

  def invite_group
    @topic ||= Topic.find_by(id: params[:topic_id])

    if @topic.is_encrypted?
      return render_json_error(I18n.t("js.encrypt.cannot_invite_group"))
    end

    super
  end
end

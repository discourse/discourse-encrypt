# frozen_string_literal: true

module DiscourseEncrypt::TopicsControllerExtensions
  def show
    if SiteSetting.encrypt_enabled?
      topic = Topic.find_by(id: (params[:topic_id] || params[:id]))
      raise Discourse::InvalidAccess if !guardian.is_user_a_member_of_encrypted_conversation?(topic)
    end
    super
  end

  def update
    @topic ||= Topic.find_by(id: params[:topic_id])

    if @topic&.is_encrypted? && params[:encrypted_title].presence
      guardian.ensure_can_edit!(@topic)
      @topic.encrypted_topics_data.update!(title: params.delete(:encrypted_title))
    end

    super
  end

  def invite
    @topic ||= Topic.find_by(id: params[:topic_id])

    if @topic.is_encrypted?
      if params[:key].present?
        @user ||= User.find_by_username_or_email(params[:user])
        guardian.ensure_can_invite_to!(@topic)
        EncryptedTopicsUser.create!(topic_id: @topic.id, user_id: @user.id, key: params[:key])
      else
        return render_json_error(I18n.t('js.encrypt.cannot_invite'))
      end
    end

    super
  end

  def invite_group
    @topic ||= Topic.find_by(id: params[:topic_id])

    if @topic.is_encrypted?
      return render_json_error(I18n.t('js.encrypt.cannot_invite_group'))
    end

    super
  end
end

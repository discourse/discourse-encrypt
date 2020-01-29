# frozen_string_literal: true

class DiscourseEncrypt::EncryptController < ApplicationController
  requires_plugin DiscourseEncrypt::PLUGIN_NAME

  before_action :ensure_logged_in
  before_action :ensure_encrypt_enabled
  skip_before_action :check_xhr

  # Saves a user's identity in their custom fields.
  #
  # Params:
  # +public+::    Serialized public identity
  # +private+::   Serialized private identity
  # +label+::     Private identity label
  # +overwrite+:: Force overwrite of public and private identities
  #
  # Returns status code 200 on success or 409 if user already has an
  # identity and public identities mismatch.
  def update_keys
    public_identity  = params.require(:public)
    private_identity = params[:private]
    private_id_label = params[:label]

    # Check if encryption is already enabled (but not changing passphrase).
    old_identity = current_user.custom_fields[DiscourseEncrypt::PUBLIC_CUSTOM_FIELD]
    if params[:overwrite].blank? && old_identity && old_identity != public_identity
      return render_json_error(I18n.t('encrypt.enabled_already'), status: 409)
    end

    current_user.custom_fields[DiscourseEncrypt::PUBLIC_CUSTOM_FIELD] = public_identity

    if private_identity.present?
      if private_id_label.present?
        data = JSON.parse(current_user.custom_fields[DiscourseEncrypt::PRIVATE_CUSTOM_FIELD]) rescue {}
        data[private_id_label.downcase] = private_identity
        current_user.custom_fields[DiscourseEncrypt::PRIVATE_CUSTOM_FIELD] = JSON.dump(data)
      else
        current_user.custom_fields[DiscourseEncrypt::PRIVATE_CUSTOM_FIELD] = private_identity
      end
    end

    current_user.save_custom_fields

    render json: success_json
  end

  # Delete a user's identity from the private identity.
  #
  # Params:
  # +label+::     Private identity label
  #
  # Returns status code 200 after label is deleted.
  def delete_key
    private_id_label = params.require(:label)

    data = JSON.parse(current_user.custom_fields[DiscourseEncrypt::PRIVATE_CUSTOM_FIELD]) rescue {}
    if data.delete(private_id_label)
      current_user.custom_fields[DiscourseEncrypt::PRIVATE_CUSTOM_FIELD] = JSON.dump(data)
      current_user.save_custom_fields
    end

    render json: success_json
  end

  # Gets public identities of a set of users.
  #
  # Params:
  # +usernames+::   Array of usernames
  #
  # Returns status code 200 and a hash of usernames and their public
  # identities.
  def show_user
    usernames = params.require(:usernames)

    identities = Hash[User.where(username: usernames).map { |u| [u.username, u.custom_fields[DiscourseEncrypt::PUBLIC_CUSTOM_FIELD]] }]

    render json: identities
  end

  # Resets encryption keys for a user.
  #
  # Params:
  # +user_id+::     ID of user to be reset
  # +everything+::  Whether user should be univited all keys removed
  #
  # Returns status code 200 after user is reset.
  def reset_user
    user_id = params.require(:user_id)

    user = User.find_by(id: user_id)
    raise Discourse::NotFound if user.blank?

    guardian.ensure_can_edit!(user)

    if params[:everything] == 'true'
      TopicAllowedUser
        .joins(topic: :_custom_fields)
        .where(topic_custom_fields: { name: DiscourseEncrypt::TITLE_CUSTOM_FIELD })
        .where(topic_allowed_users: { user_id: user.id })
        .delete_all

      PluginStoreRow
        .where(plugin_name: 'discourse-encrypt')
        .where("key LIKE 'key_%_' || ?", user.id)
        .delete_all
    end

    # Delete encryption keys.
    user.custom_fields.delete(DiscourseEncrypt::PUBLIC_CUSTOM_FIELD)
    user.custom_fields.delete(DiscourseEncrypt::PRIVATE_CUSTOM_FIELD)
    user.save_custom_fields

    render json: success_json
  end

  # Updates an encrypted post, used immediately after creating one to
  # update signature.
  #
  # Params:
  # +post_id+::       ID of post to be updated
  # +encrypted_raw+:: Encrypted raw with signature included
  #
  # Returns status code 200 after post is updated.
  def update_post
    post_id = params.require(:post_id)
    encrypted_raw = params.require(:encrypted_raw)

    post = Post.find_by(id: post_id)
    guardian.ensure_can_edit!(post)

    if post.updated_at < 5.seconds.ago
      return render_json_error(I18n.t('too_late_to_edit'), status: 409)
    end

    post.update!(raw: encrypted_raw)

    render json: success_json
  end

  private

  def ensure_encrypt_enabled
    groups = current_user.groups.pluck(:name).map(&:downcase)
    encrypt_groups = SiteSetting.encrypt_groups.split('|').map(&:downcase)

    if !SiteSetting.encrypt_groups.empty? && (groups & encrypt_groups).empty?
      raise Discourse::InvalidAccess
    end
  end
end

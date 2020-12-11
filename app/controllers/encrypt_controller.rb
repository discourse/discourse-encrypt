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
    old_identity = current_user.user_encryption_key&.encrypt_public
    if params[:overwrite].blank? && old_identity && old_identity != public_identity
      return render_json_error(I18n.t('encrypt.enabled_already'), status: 409)
    end

    current_user.user_encryption_key = UserEncryptionKey.new(user_id: current_user.id) if !current_user.user_encryption_key
    current_user.user_encryption_key.encrypt_public = public_identity

    if private_identity.present?
      if private_id_label.present?
        data = JSON.parse(current_user.user_encryption_key.encrypt_private) rescue {}
        data[private_id_label.downcase] = private_identity
        current_user.user_encryption_key.encrypt_private = JSON.dump(data)
      else
        current_user.user_encryption_key.encrypt_private = private_identity
      end
    end

    current_user.user_encryption_key.save
    current_user.publish_identity

    DiscourseEvent.trigger(:enabled_encrypt, current_user) if !old_identity

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

    data = JSON.parse(current_user.user_encryption_key.encrypt_private) rescue {}
    if data.delete(private_id_label)
      current_user.user_encryption_key = UserEncryptionKey.new(user_id: current_user.id) if !current_user.user_encryption_key
      current_user.user_encryption_key.update!(encrypt_private: JSON.dump(data))

      current_user.publish_identity
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

    identities = User
      .includes(:user_encryption_key)
      .where(username_lower: usernames.map(&:downcase))
      .map { |u| [u.username, u.user_encryption_key&.encrypt_public] }
      .to_h

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
        .joins(topic: :encrypted_topics_data)
        .where.not(encrypted_topics_data: { id: nil })
        .where(topic_allowed_users: { user_id: user.id })
        .delete_all

      EncryptedTopicsUser
        .where(user_id: user.id)
        .delete_all
    end

    user.user_encryption_key&.delete

    MessageBus.publish(
      '/plugin/encrypt/keys',
      { public: nil, private: nil },
      user_ids: [user.id]
    )

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

    guardian.ensure_can_encrypt_post!(post)

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

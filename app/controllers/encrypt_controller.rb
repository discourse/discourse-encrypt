# frozen_string_literal: true

class DiscourseEncrypt::EncryptController < ApplicationController
  requires_plugin DiscourseEncrypt::PLUGIN_NAME

  before_action :ensure_logged_in
  before_action :ensure_can_encrypt

  # Saves a user's identity in their custom fields.
  #
  # Params:
  # +public+::    Serialized public identity
  # +private+::   Serialized private identity
  # +label+::     Private identity label
  #
  # Returns status code 200 on success or 409 if user already has an
  # identity and public identities mismatch.
  def update_keys
    public_identity = params.require(:public)
    private_identity = params[:private]
    private_id_label = params[:label]

    # Allow user to update only their private identity if they have already
    # generated a key. This ensures the user cannot enable encryption on two
    # different devices at the same time.
    old_identity = current_user.user_encryption_key&.encrypt_public
    if old_identity && old_identity != public_identity
      return render_json_error(I18n.t("encrypt.enabled_already"), status: 409)
    end

    current_user.user_encryption_key =
      UserEncryptionKey.new(user_id: current_user.id) if !current_user.user_encryption_key
    current_user.user_encryption_key.encrypt_public = public_identity

    if private_identity.present?
      if private_id_label.present?
        data =
          begin
            JSON.parse(current_user.user_encryption_key.encrypt_private)
          rescue StandardError
            {}
          end
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

    data =
      begin
        JSON.parse(current_user.user_encryption_key.encrypt_private)
      rescue StandardError
        {}
      end
    if data.delete(private_id_label)
      current_user.user_encryption_key =
        UserEncryptionKey.new(user_id: current_user.id) if !current_user.user_encryption_key
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

    identities =
      User
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

    if params[:everything] == "true"
      TopicAllowedUser
        .joins(topic: :encrypted_topics_data)
        .where.not(encrypted_topics_data: { id: nil })
        .where(topic_allowed_users: { user_id: user.id })
        .delete_all

      EncryptedTopicsUser.where(user_id: user.id).delete_all
    end

    user.user_encryption_key&.delete

    MessageBus.publish("/plugin/encrypt/keys", { public: nil, private: nil }, user_ids: [user.id])

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
      return render_json_error(I18n.t("too_late_to_edit"), status: 409)
    end

    post.update!(raw: encrypted_raw)

    render json: success_json
  end

  # Gets stats (encrypted PMs count) for a user.
  #
  # Params:
  # +user_id+::     ID of user to be reset
  #
  # Returns status code 200 and the number of encrypted PMs the user can
  # access.
  def stats
    user_id = params.require(:user_id)

    user = User.find_by(id: user_id)
    raise Discourse::NotFound if user.blank?

    guardian.ensure_can_edit!(user)

    pms_count =
      TopicAllowedUser
        .joins(topic: :encrypted_topics_data)
        .where.not(encrypted_topics_data: { id: nil })
        .where(topic_allowed_users: { user_id: user.id })
        .count

    keys_count = EncryptedTopicsUser.where(user_id: user.id).count

    render json: success_json.merge(encrypted_pms_count: [pms_count, keys_count].max)
  end

  # Lists encrypted topics and posts of a user to perform client-sided search
  # in encrypted content.
  #
  # Returns status code 200, topics and posts.
  def posts
    term = "in:first".dup
    term << " #{params[:term]}" if params[:term].present?

    search =
      EncryptedSearch.new(term, guardian: guardian, type_filter: "private_messages", limit: 250)
    result = search.execute
    result.find_user_data(guardian) if result

    render_serialized(result, GroupedSearchResultSerializer, result: result)
  end

  # Get all topic keys for current user.
  #
  # Returns all keys to all encrypted PMs.
  def show_all_keys
    topic_keys = EncryptedTopicsUser.where(user: current_user).pluck(:topic_id, :key).to_h
    render json: success_json.merge(topic_keys: topic_keys)
  end

  # Updates all keys for current user.
  #
  # Params:
  # +keys+::    All topic keys
  # +public+::  Serialized public identity
  #
  # Returns status code 200 if all keys are updated or status code 400 if not
  # all keys have a replacement.
  def update_all_keys
    raise Discourse::InvalidParameters.new(:public) if params[:public].blank?

    ActiveRecord::Base.transaction do
      a = EncryptedTopicsUser.where(user: current_user).pluck(:topic_id)
      b = (params[:keys] || {}).keys.map(&:to_i)
      raise Discourse::InvalidParameters.new(:keys) if a.sort != b.sort

      user_key = UserEncryptionKey.find_or_initialize_by(user_id: current_user.id)
      user_key.encrypt_public = params[:public]
      user_key.encrypt_private = nil
      user_key.save!

      params[:keys]&.each do |topic_id, key|
        EncryptedTopicsUser.where(user: current_user, topic_id: topic_id).update_all(key: key)
      end
    end

    render json: success_json
  end

  def data_for_decryption
    raise Discourse::InvalidAccess if !SiteSetting.allow_decrypting_pms

    topic = Topic.find(params[:topic_id])
    guardian.ensure_can_see!(topic)
    raise Discourse::NotFound if !topic.is_encrypted?

    encrypted_data = topic.encrypted_topics_data

    posts = topic.posts.where(post_type: Post.types[:regular], deleted_at: nil)

    render json: { title: "#{encrypted_data.title}", posts: posts.map { |p| [p.id, p.raw] }.to_h }
  end

  def complete_decryption
    raise Discourse::InvalidAccess if !SiteSetting.allow_decrypting_pms

    topic = Topic.find(params[:topic_id])
    guardian.ensure_can_see!(topic)
    raise Discourse::NotFound if !topic.is_encrypted?

    decrypted_title = params[:title]
    decrypted_posts = params[:posts]

    Topic.transaction do
      decrypted_posts.each do |post_id, raw|
        post = topic.posts.find(post_id)

        revision = { raw: raw }

        revision[:title] = decrypted_title if post.post_number == 1

        post.revise(
          current_user,
          **revision,
          skip_validations: true,
          bypass_rate_limiter: true,
          bypass_bump: true,
          edit_reason: "Decrypting topic",
        )
      end
      topic.encrypted_topics_data.destroy!
    end

    render json: success_json
  end

  private

  def ensure_can_encrypt
    current_user.guardian.ensure_can_encrypt!
  end
end

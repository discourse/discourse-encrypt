# name: discourse-encrypt
# about: Provides encrypted communication channels through Discourse.
# version: 0.1
# authors: Dan Ungureanu
# url: https://github.com/udan11/discourse-encrypt.git

enabled_site_setting :encrypt_enabled

DiscoursePluginRegistry.serialized_current_user_fields << "encrypt_public_key"
DiscoursePluginRegistry.serialized_current_user_fields << "encrypt_private_key"

after_initialize do

  module ::DiscourseEncrypt
    PLUGIN_NAME = 'discourse-encrypt'

    Store = PluginStore.new(PLUGIN_NAME)

    class Engine < ::Rails::Engine
      engine_name PLUGIN_NAME
      isolate_namespace DiscourseEncrypt
    end

    class EncryptController < ::ApplicationController
      requires_plugin PLUGIN_NAME

      before_action :ensure_logged_in
      skip_before_action :check_xhr

      def put
        public_key  = params.permit(:public_key)
        private_key = params.require(:private_key)

        current_user.custom_fields['encrypt_public_key'] = public_key if public_key
        current_user.custom_fields['encrypt_private_key'] = private_key
        current_user.save!

        render json: { success: true }
      end

      def delete
        current_user.custom_fields.delete('encrypt_public_key')
        current_user.custom_fields.delete('encrypt_private_key')
        current_user.save!

        render json: { success: true }
      end

      def get_userkeys
        usernames = params.require(:usernames)

        keys = Hash[User.where(username: usernames).map { |u| [u.username, u.custom_fields['encrypt_public_key']] }]

        render json: keys
      end

      def put_topickeys
        topic_id = params.require(:topic_id)
        keys = params.require(:keys)

        users = Hash[User.where(username: keys.keys).map { |u| [u.username, u] }]
        keys.each { |u, k| Store.set("key_#{topic_id}_#{users[u].id}", k) }

        render json: { success: true }
      end

      def delete_topickeys
        topic_id = params.require(:topic_id)
        usernames = params.require(:users)

        users = Hash[User.where(username: usernames).map { |u| [u.username, u] }]
        usernames.each { |u| Store.remove("key_#{topic_id}_#{users[u].id}") }

        render json: { success: true }
      end
    end
  end

  add_to_serializer(:topic_view, :topic_key, false) do
    return PluginStore.get(DiscourseEncrypt::PLUGIN_NAME, "key_#{object.topic.id}_#{scope.user.id}")
  end

  add_to_serializer(:topic_view, :include_topic_key?) do
    return scope.user
  end

  add_to_serializer(:topic_list_item, :topic_key, false) do
    return PluginStore.get(DiscourseEncrypt::PLUGIN_NAME, "key_#{object.id}_#{scope.user.id}")
  end

  add_to_serializer(:topic_list_item, :include_topic_key?) do
    return scope.user
  end

  add_to_serializer(:suggested_topic, :topic_key, false) do
    return PluginStore.get(DiscourseEncrypt::PLUGIN_NAME, "key_#{object.id}_#{scope.user.id}")
  end

  add_to_serializer(:suggested_topic, :include_topic_key?) do
    return scope.user
  end

  DiscourseEncrypt::Engine.routes.draw do
    put    '/encrypt/keys'      => 'encrypt#put'
    delete '/encrypt/keys'      => 'encrypt#delete'
    get    '/encrypt/userkeys'  => 'encrypt#get_userkeys'
    put    '/encrypt/topickeys' => 'encrypt#put_topickeys'
    delete '/encrypt/topickeys' => 'encrypt#delete_topickeys'
  end

  Discourse::Application.routes.append do
    mount ::DiscourseEncrypt::Engine, at: '/'
  end
end

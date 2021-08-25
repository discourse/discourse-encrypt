# frozen_string_literal: true

# This class is used only to preload all data needed to display encrypted
# search results. The actual search is performed on the client side.
class EncryptedSearch < Search

  # Simplified posts_query that does almost nothing, but fetch visible posts.
  # The term is looked up on the client side.
  def posts_query(limit, type_filter: nil)
    Post
      .includes(topic: :encrypted_topics_data)
      .where.not(encrypted_topics_data: { title: nil })
      .joins(topic: :encrypted_topics_users)
      .where(encrypted_topics_users: { user_id: @guardian.user&.id })
      .where(post_number: 1)
      .where(post_type: Topic.visible_post_types(@guardian.user))
      .where('post_search_data.private_message')
      .limit(limit)
  end

  # Similar to posts_query does almost nothing other than to return a set of
  # posts that might be relevant.
  def private_messages_search
    raise Discourse::InvalidAccess.new if @guardian.anonymous?

    @search_pms = true # needed by posts_eager_loads
    posts = posts_scope(posts_eager_loads(posts_query(@opts[:limit], type_filter: @opts[:type_filter])))
    posts.each { |post| @results.add(post) }
  end

  def posts_scope(default_scope = Post.all)
    if SiteSetting.use_pg_headlines_for_excerpt
      default_scope.select(
        "topics.fancy_title AS topic_title_headline",
        "posts.cooked AS headline",
        "LEFT(posts.cooked, 50) AS leading_raw_data",
        "RIGHT(posts.cooked, 50) AS trailing_raw_data",
        default_scope.arel.projections
      )
    else
      default_scope
    end
  end
end

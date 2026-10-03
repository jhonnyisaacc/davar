module Api
  module V1
    class ArticlesController < BaseController
      skip_before_action :authenticate!
      def index
        articles = Article.published.order(:source_id)
        articles = articles.where(locale: params[:locale]) if params[:locale].present?
        render json: {articles: articles.limit(100).as_json(only: %i[id source_id title locale source_url attribution references revision])}
      end
      def show
        render json: Article.published.find(params[:id]).as_json(only: %i[id source_id title locale body source_url attribution references revision permissions])
      end
    end
  end
end

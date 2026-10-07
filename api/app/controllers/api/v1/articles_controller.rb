module Api
  module V1
    class ArticlesController < BaseController
      skip_before_action :authenticate!
      def index
        render json: PublishedArticles.page(locale: params[:locale], offset: params[:offset])
      end
      def show
        render json: PublishedArticles.find(params[:id])
      end
    end
  end
end

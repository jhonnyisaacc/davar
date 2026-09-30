module Api
  module V1
    class ProviderConnectionsController < BaseController
      def index
        render json: {connections: current_user.provider_connections.as_json(only: %i[id provider model]), supported: %w[claude grok chatgpt gemini], unavailable: ["muse"]}
      end
      def create
        raise DomainError.new("registered_account_required", 403) unless current_user.identities.exists?
        raise DomainError.new("provider_not_supported", 503) unless CommentaryProvider.supported?(params[:provider])
        raise DomainError.new("invalid_model") unless params[:model].to_s.match?(/\A[a-zA-Z0-9._-]{1,120}\z/)
        raise DomainError.new("invalid_credential") unless params[:credential].is_a?(String) && params[:credential].length.between?(8, 1000)
        connection = current_user.provider_connections.find_or_initialize_by(provider: params[:provider])
        connection.update!(credential: params[:credential], model: params[:model])
        render json: connection.as_json(only: %i[id provider model])
      end
      def destroy
        current_user.provider_connections.find(params[:id]).destroy!
        head :no_content
      end
    end
  end
end

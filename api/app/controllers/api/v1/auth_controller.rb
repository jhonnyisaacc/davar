module Api
  module V1
    class AuthController < BaseController
      skip_before_action :authenticate!, except: :destroy
      def guest
        throttle!("guest/#{request.remote_ip}", limit: 3)
        user = User.create!(display_name: "Guest")
        _, token = Session.issue!(user)
        render json: {token: token}, status: :created
      end
      def providers
        render json: {providers: %w[google apple facebook telegram x email].map { |id| {id: id, available: id == "email" || OauthProviders.available?(id)} }}
      end
      def start
        throttle!("auth/#{request.remote_ip}", limit: 10)
        user = params[:link] == true ? current_user : nil
        raise DomainError.new("authentication_required", 401) if params[:link] == true && !user
        render json: Authentication.start!(provider: params[:provider], return_uri: params[:return_uri], email: params[:email], user: user, notification_consent: params[:notification_consent] == true)
      end
      def callback
        raise DomainError.new("provider_denied", 401) if params[:error].present?
        redirect_to Authentication.finish!(provider: params[:provider], state: params[:state], code: params[:code]), allow_other_host: true
      end
      def exchange
        throttle!("exchange/#{request.remote_ip}", limit: 20)
        render json: {token: Authentication.exchange!(params[:code])}
      end
      def destroy
        current_session.update!(revoked_at: Time.current)
        head :no_content
      end
    end
  end
end

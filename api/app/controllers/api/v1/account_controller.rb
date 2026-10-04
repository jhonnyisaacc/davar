module Api
  module V1
    class AccountController < BaseController
      def show
        render json: AccountSerializer.call(current_user)
      end
      def update
        data = params.permit(:display_name, :discoverable, :contact_visible).to_h
        profile = params[:profile].permit(*AccountProfile::PROFILE_KEYS.excluding("answers"), answers: {}).to_h if params[:profile]
        AccountProfile.update!(current_user, data, profile)
        show
      end
      def settings
        UserSettings.update!(current_user, params.require(:settings).permit(*UserSettings::KEYS).to_h, params.require(:version).to_i)
        show
      end
      def redeem
        FeatureFlags.require!("assemblies", current_user)
        throttle!("admission/#{current_user.id}", limit: 10)
        Admissions.redeem!(current_user, params[:code])
        show
      end
      def notification_preferences
        raise DomainError.new("notification_authorization_required") unless params[:enabled] == false
        current_user.with_lock { current_user.update!(settings: current_user.settings.merge("telegram_notifications"=>false), settings_version: current_user.settings_version + 1) }
        show
      end
      def notifications
        render json: {notifications: current_user.notifications.order(created_at: :desc).limit(100).as_json(only: %i[id kind data read_at created_at])}
      end
    end
  end
end

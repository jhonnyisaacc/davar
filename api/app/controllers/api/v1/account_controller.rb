module Api
  module V1
    class AccountController < BaseController
      PROFILE_KEYS = %w[experience answers gender birth_date visibility_reviewed].freeze
      def show
        render json: AccountSerializer.call(current_user)
      end
      def update
        data = params.permit(:display_name, :discoverable, :contact_visible).to_h
        if params[:profile]
          profile = params[:profile].permit(*PROFILE_KEYS.excluding("answers"), answers: {}).to_h
          old = current_user.profile || {}
          raise DomainError.new("female_leader_forbidden") if profile.fetch("gender", old["gender"]) == "female" && (current_user.leader_verified || profile.fetch("experience", old["experience"]) == "leader")
          if profile["answers"]
            allowed = profile.fetch("experience", old["experience"]) == "starting" ? %w[1 3] : %w[1 2 3 4 5 6 7]
            raise DomainError.new("invalid_answers") unless profile["answers"].keys.all? { |key| allowed.include?(key) } && profile["answers"].values.all? { |value| value == true || value == false }
          end
          raise DomainError.new("invalid_gender") if profile["gender"] && !profile["gender"].in?(%w[male female])
          raise DomainError.new("invalid_experience") if profile["experience"] && !profile["experience"].in?(%w[starting experienced leader])
          data[:profile] = old.merge(profile)
        end
        if data["contact_visible"] == true && !current_user.identities.exists?(provider: "telegram")
          raise DomainError.new("telegram_contact_required")
        end
        current_user.update!(data)
        show
      end
      def settings
        UserSettings.update!(current_user, params.require(:settings).permit(*UserSettings::KEYS).to_h, params.require(:version).to_i)
        show
      end
      def redeem
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

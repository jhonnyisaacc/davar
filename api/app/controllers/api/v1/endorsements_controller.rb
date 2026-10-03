module Api
  module V1
    class EndorsementsController < BaseController
      before_action :assemblies_access!
      def index
        render json: {endorsements: Endorsement.where("applicant_id = ? OR leader_id = ?", current_user.id, current_user.id).includes(:applicant, :leader).limit(100).map { |item|
          {id: item.id, state: item.state, applicant_name: item.applicant.display_name, leader_name: item.leader.display_name, can_decide: item.leader_id == current_user.id && item.state == "requested"}
        }}
      end
      def create
        raise DomainError.new("onboarding_required", 403) unless current_user.completed_onboarding? && current_user.profile["experience"] == "leader" && current_user.profile["gender"] == "male"
        leader = User.find(params[:leader_id])
        raise DomainError.new("invalid_endorser") unless leader.leader_verified && leader.id != current_user.id
        endorsement = nil
        current_user.with_lock do
          raise DomainError.new("contact_support", 409) if Endorsement.where(applicant: current_user, state: "declined").exists?
          raise DomainError.new("two_endorsers_maximum", 409) if Endorsement.where(applicant: current_user).count >= 2
          endorsement = Endorsement.create!(applicant: current_user, leader: leader)
          Notification.create!(user: leader, kind: "endorsement_requested", data: {endorsement_id: endorsement.id})
        end
        render json: endorsement.as_json(only: %i[id state]), status: :created
      end
      def update
        endorsement = Endorsement.find_by!(id: params[:id], leader: current_user)
        raise DomainError.new("invalid_decision") unless params[:state].in?(%w[accepted declined])
        endorsement.applicant.with_lock do
          endorsement.lock!
          raise DomainError.new("request_not_pending", 409) unless endorsement.state == "requested"
          endorsement.update!(state: params[:state])
          # Both named endorsers must accept; one decline requires support.
          if Endorsement.where(applicant: endorsement.applicant, state: "accepted").count == 2 && endorsement.applicant.profile["gender"] == "male"
            endorsement.applicant.update!(leader_verified: true)
          end
          Notification.create!(user: endorsement.applicant, kind: "endorsement_#{endorsement.state}", data: {endorsement_id: endorsement.id})
        end
        render json: endorsement.as_json(only: %i[id state])
      end
    end
  end
end

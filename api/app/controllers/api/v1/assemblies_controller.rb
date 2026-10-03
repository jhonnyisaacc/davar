module Api
  module V1
    class AssembliesController < BaseController
      before_action :assemblies_access!
      before_action do
        raise DomainError.new("onboarding_required", 403) unless current_user.completed_onboarding?
      end
      def index
        result = AssemblyDiscovery.new(current_user, params).call
        render json: {assemblies: result[:rows].map { |assembly, distance| AssemblySerializer.call(assembly, current_user, distance: distance&.round(1)) }, people: result[:people]}
      rescue ArgumentError, TypeError
        raise DomainError.new("invalid_area")
      end
      def leaders
        query = params[:q].to_s.downcase
        raise DomainError.new("invalid_leader_query") if query.length > 100
        users = User.where(leader_verified: true).where.not(id: current_user.id).limit(100)
        render json: {leaders: users.filter_map { |user|
          next unless query.empty? || user.display_name.to_s.downcase.include?(query)
          {id: user.id, name: user.display_name, city: user.profile&.fetch("city", nil)}
        }}
      end
      def show
        render json: AssemblySerializer.call(Assembly.includes(:memberships).find(params[:id]), current_user)
      end
      def create
        current_user.with_lock do
          raise DomainError.new("leader_verification_required", 403) unless AssemblyPolicy.new(current_user).create?
          raise DomainError.new("already_member_elsewhere", 409) if current_user.memberships.where(state: "member").exists?
          assembly = Assembly.create!(creation_params.merge(leader: current_user))
          Membership.create!(user: current_user, assembly: assembly, state: "member")
          render json: AssemblySerializer.call(assembly, current_user), status: :created
        end
      end
      def update
        assembly = managed!
        assembly.update!(assembly_params.except(:kind, :city, :latitude, :longitude))
        render json: AssemblySerializer.call(assembly, current_user)
      end
      def join
        throttle!("join/#{current_user.id}")
        membership = AssemblyMemberships.request!(current_user, Assembly.find(params[:id]))
        render json: {id: membership.id, state: membership.state}
      end
      def leave
        assembly = Assembly.find(params[:id])
        raise DomainError.new("leader_cannot_leave", 409) if assembly.leader_id == current_user.id
        current_user.with_lock { current_user.memberships.find_by!(assembly: assembly).update!(state: "left") }
        head :no_content
      end
      def members
        assembly = managed!
        render json: {memberships: assembly.memberships.where(state: %w[member requested]).includes(user: :identities).map { |m|
          {id: m.id, state: m.state, user: {id: m.user_id, name: m.user.display_name, gender: m.state == "requested" ? m.user.profile&.fetch("gender", nil) : nil, age: m.user.age, contact_url: m.user.contact_visible ? m.user.telegram_contact : nil}}
        }}
      end
      def decide
        membership = managed!.memberships.find(params[:membership_id])
        AssemblyMemberships.decide!(current_user, membership, params[:decision])
        render json: {id: membership.id, state: membership.state}
      end
      private
      def creation_params
        attributes = assembly_params
        if attributes[:kind] == "in_person"
          location = current_user.profile || {}
          raise DomainError.new("city_selection_required") unless location["latitude"] && location["longitude"]
          attributes.merge!(city: location["city"], latitude: location["latitude"], longitude: location["longitude"])
        end
        attributes
      end
      def assembly_params
        params.permit(:name, :kind, :city, :latitude, :longitude, :meeting_url).to_h.symbolize_keys
      end
      def managed!
        Assembly.find_by!(id: params[:id], leader_id: current_user.id)
      end
    end
  end
end

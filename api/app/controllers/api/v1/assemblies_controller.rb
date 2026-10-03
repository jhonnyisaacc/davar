module Api
  module V1
    class AssembliesController < BaseController
      before_action :assemblies_access!
      before_action do
        raise DomainError.new("onboarding_required", 403) unless current_user.completed_onboarding?
      end
      def index
        kind = params.fetch(:kind, "in_person")
        raise DomainError.new("invalid_kind") unless kind.in?(%w[in_person online])
        assemblies = Assembly.where(kind: kind).includes(:memberships).order(:id)
        people = []
        if kind == "in_person"
          lat, lon = Float(params[:latitude]), Float(params[:longitude])
          radius = Integer(params.fetch(:radius_km, 25))
          raise DomainError.new("invalid_area") unless lat.between?(-90, 90) && lon.between?(-180, 180) && radius.in?([10, 25, 50, 100])
          # Approximate stored locations; bound rows before calculating distance.
          assemblies = assemblies.where(latitude: (lat-radius/111.0)..(lat+radius/111.0))
          rows = assemblies.limit(1000).filter_map do |assembly|
            next unless assembly.latitude && assembly.longitude
            distance = distance_km(lat, lon, assembly.latitude.to_f, assembly.longitude.to_f)
            [assembly, distance] if distance <= radius
          end.sort_by(&:last)
          if rows.empty?
            people = User.where(discoverable: true).where.not(id: current_user.id).includes(:identities).limit(500).filter_map do |user|
              profile = user.profile || {}
              next unless user.identities.any? && (!Admissions.required? || user.admitted_at) && user.completed_onboarding? && user.doctrinal_agreement? && profile["latitude"] && profile["longitude"]
              next if distance_km(lat, lon, profile["latitude"].to_f, profile["longitude"].to_f) > radius
              {id: user.id, name: user.display_name, area: profile["city"], contact_url: user.contact_visible ? user.telegram_contact : nil}
            end
          end
        else
          rows = assemblies.limit(100).map { |assembly| [assembly, nil] }
        end
        render json: {assemblies: rows.first(100).map { |assembly, distance| AssemblySerializer.call(assembly, current_user, distance: distance&.round(1)) }, people: people}
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
      def distance_km(lat, lon, other_lat, other_lon)
        rad = Math::PI / 180
        a = Math.sin((other_lat-lat)*rad/2)**2 + Math.cos(lat*rad)*Math.cos(other_lat*rad)*Math.sin((other_lon-lon)*rad/2)**2
        6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt([1-a, 0].max))
      end
    end
  end
end

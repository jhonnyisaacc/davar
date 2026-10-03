# Discovery bounds database candidates before applying distance and privacy rules.
class AssemblyDiscovery
  def initialize(user, filters)
    @user = user
    @filters = filters
  end

  def call
    kind = @filters.fetch(:kind, "in_person")
    raise DomainError.new("invalid_kind") unless kind.in?(%w[in_person online])
    assemblies = Assembly.where(kind: kind).includes(:memberships).order(:id)
    people = []
    if kind == "in_person"
      lat, lon = Float(@filters[:latitude]), Float(@filters[:longitude])
      radius = Integer(@filters.fetch(:radius_km, 25))
      raise DomainError.new("invalid_area") unless lat.between?(-90, 90) && lon.between?(-180, 180) && radius.in?([10, 25, 50, 100])
      # Approximate stored locations; bound rows before calculating distance.
      assemblies = assemblies.where(latitude: (lat-radius/111.0)..(lat+radius/111.0))
      rows = assemblies.limit(1000).filter_map do |assembly|
        next unless assembly.latitude && assembly.longitude
        distance = distance_km(lat, lon, assembly.latitude.to_f, assembly.longitude.to_f)
        [assembly, distance] if distance <= radius
      end.sort_by(&:last)
      if rows.empty?
        people = User.where(discoverable: true).where.not(id: @user.id).includes(:identities).limit(500).filter_map do |user|
          profile = user.profile || {}
          next unless user.identities.any? && (!Admissions.required? || user.admitted_at) && user.completed_onboarding? && user.doctrinal_agreement? && profile["latitude"] && profile["longitude"]
          next if distance_km(lat, lon, profile["latitude"].to_f, profile["longitude"].to_f) > radius
          {id: user.id, name: user.display_name, area: profile["city"], contact_url: user.contact_visible ? user.telegram_contact : nil}
        end
      end
    else
      rows = assemblies.limit(100).map { |assembly| [assembly, nil] }
    end
    {rows: rows.first(100), people: people}
  rescue ArgumentError, TypeError
    raise DomainError.new("invalid_area")
  end

  private
  def distance_km(lat, lon, other_lat, other_lon)
    rad = Math::PI / 180
    a = Math.sin((other_lat-lat)*rad/2)**2 + Math.cos(lat*rad)*Math.cos(other_lat*rad)*Math.sin((other_lon-lon)*rad/2)**2
    6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt([1-a, 0].max))
  end
end

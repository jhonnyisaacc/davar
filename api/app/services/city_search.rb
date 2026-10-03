class CitySearch
  def self.search(query)
    raise DomainError.new("invalid_city_query") unless query.is_a?(String) && query.length.between?(2, 100)
    return DevelopmentSandbox.cities(query) if DevelopmentSandbox.enabled?
    payload = Rails.cache.fetch("cities/#{Digest::SHA256.hexdigest(query.downcase)}", expires_in: 1.day) {
      ProviderHttp.json("https://photon.komoot.io/api/?#{URI.encode_www_form(q: query, limit: 30)}")
    }
    payload.fetch("features", []).filter_map do |feature|
      properties = feature.fetch("properties", {})
      # Never offer neighborhoods as cities.
      next unless properties["osm_value"].in?(%w[city town municipality village])
      coordinates = feature.dig("geometry", "coordinates")
      next unless coordinates&.length == 2
      city = properties["city"].presence || properties["name"]
      next if city.blank? || properties["country"].blank?
      data = {city: city, country: properties["country"], state: properties["state"],
        latitude: (coordinates[1] * 20).round / 20.0, longitude: (coordinates[0] * 20).round / 20.0}
      data.merge(selection: Rails.application.message_verifier("city-selection").generate(data, expires_in: 1.day))
    end.uniq { |city| [city[:city], city[:country]] }.first(10)
  end
  def self.resolve(selection)
    Rails.application.message_verifier("city-selection").verify(selection)
  rescue ActiveSupport::MessageVerifier::InvalidSignature
    raise DomainError.new("invalid_city_selection")
  end
end

class DevelopmentSandbox
  def self.enabled?
    Rails.env.development? && ENV["DAVAR_DEV_SANDBOX"] == "1"
  end
  def self.require_enabled!
    raise "Development sandbox is disabled" unless enabled?
  end
  CITIES = [
    {city: "Buenos Aires", country: "Argentina", latitude: -34.6, longitude: -58.4},
    {city: "Jerusalem", country: "Israel", latitude: 31.8, longitude: 35.25},
    {city: "Madrid", country: "Spain", latitude: 40.4, longitude: -3.7},
    {city: "São Paulo", country: "Brazil", latitude: -23.55, longitude: -46.65}
  ].freeze
  def self.cities(query)
    require_enabled!
    CITIES.select { |city| I18n.transliterate(city[:city]).downcase.include?(I18n.transliterate(query).downcase) }.map do |city|
      city.merge(selection: Rails.application.message_verifier("city-selection").generate(city, expires_in: 1.day))
    end
  end
  def self.generate(messages:)
    require_enabled!
    prompt = messages.last&.fetch(:content, "").to_s
    raise DomainError.new("development_simulated_failure", 503) if prompt.include?("[sandbox:failure]")
    "[Development simulation — no AI service called]\nThis synthetic response exercises conversation persistence and source handoff. It is not Scripture interpretation or reviewed evidence. Your message: #{prompt.first(300)}"
  end
end

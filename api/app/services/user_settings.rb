class UserSettings
  KEYS = %w[themeMode language hebrewFontScale besorahTextVersion besorahLanguage showQumran showFullChapter seferMode hebrewOnly translationOnly showCantillation showNikud].freeze
  def self.update!(user, changes, version)
    raise DomainError.new("unknown_setting") unless (changes.keys - KEYS).empty?
    raise DomainError.new("invalid_settings") unless changes.all? { |key, value| valid?(key, value) }
    user.with_lock do
      raise DomainError.new("settings_conflict", 409) unless user.settings_version == version
      settings = user.settings.merge(changes)
      settings["translationOnly"] = false if changes["hebrewOnly"] == true
      settings["hebrewOnly"] = false if changes["translationOnly"] == true
      settings["seferMode"] = false unless settings["showFullChapter"] && (settings["hebrewOnly"] || settings["translationOnly"])
      user.update!(settings: settings, settings_version: version + 1)
    end
  end
  def self.valid?(key, value)
    case key
    when "themeMode" then value.in?(%w[light dark])
    when "language" then value.in?(%w[en es he])
    when "besorahTextVersion" then value.in?(%w[delitzsch hutter])
    when "besorahLanguage" then value.in?(%w[hebrew greek])
    when "hebrewFontScale" then value.is_a?(Numeric) && value.between?(0.5, 3)
    else value == true || value == false
    end
  end
end

if Rails.env.production? || Rails.env.staging?
  required = %w[DATABASE_URL SECRET_KEY_BASE API_PUBLIC_URL API_HOSTS WEB_ORIGINS AUTH_RETURN_URIS]
  missing = required.select { |key| ENV[key].blank? }
  raise "Missing #{Rails.env} configuration: #{missing.join(', ')}" if missing.any?
  uri = URI.parse(ENV.fetch("API_PUBLIC_URL"))
  raise "API_PUBLIC_URL must use HTTPS in #{Rails.env}" unless uri.scheme == "https" && uri.host.present?
end

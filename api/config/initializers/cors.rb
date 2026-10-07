require_relative "../web_origins"

web_origins = WebOrigins.allowed(configured: ENV["WEB_ORIGINS"], development: Rails.env.development?)

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*web_origins)
    resource "/api/*", headers: %w[Authorization Content-Type], methods: %i[get post patch delete options]
  end
end

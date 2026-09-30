Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*ENV.fetch("WEB_ORIGINS", "http://localhost:3002,http://localhost:8082").split(","))
    resource "/api/*", headers: %w[Authorization Content-Type], methods: %i[get post patch delete options]
  end
end

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*ENV.fetch("WEB_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081").split(","))
    resource "/api/*", headers: %w[Authorization Content-Type], methods: %i[get post patch delete options]
  end
end

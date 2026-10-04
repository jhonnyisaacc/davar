module WebOrigins
  DEFAULT = %w[http://localhost:5173 http://127.0.0.1:5173 http://localhost:8081 http://127.0.0.1:8081].freeze
  DEVELOPMENT = %w[localhost 127.0.0.1 0.0.0.0].product([5173, 5174, 8081]).map do |host, port|
    "http://#{host}:#{port}"
  end.freeze

  def self.allowed(configured:, development:)
    origins = configured.nil? ? DEFAULT : configured.split(",").map(&:strip).reject(&:empty?)
    development ? origins | DEVELOPMENT : origins
  end
end

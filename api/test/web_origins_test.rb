require "test_helper"
require "rack/mock"

class WebOriginsTest < ActiveSupport::TestCase
  def preflight(origin, development:, configured: "http://localhost:5173,http://127.0.0.1:5173")
    origins = WebOrigins.allowed(configured: configured, development: development)
    cors = Rack::Cors.new(->(_env) { [200, {}, []] }) do
      allow do
        origins(*origins)
        resource "/api/*", headers: %w[Authorization Content-Type], methods: %i[get post patch delete options]
      end
    end
    Rack::MockRequest.new(cors).options("/api/v1/calendar/locations?q=Buenos", {
      "HTTP_ORIGIN" => origin,
      "HTTP_ACCESS_CONTROL_REQUEST_METHOD" => "GET",
      "HTTP_ACCESS_CONTROL_REQUEST_HEADERS" => "content-type"
    })
  end

  test "development accepts the web gateway and Bun HTML server with existing settings" do
    %w[localhost 127.0.0.1 0.0.0.0].product([5173, 5174, 8081]).each do |host, port|
      origin = "http://#{host}:#{port}"
      response = preflight(origin, development: true)
      assert_equal origin, response["access-control-allow-origin"]
      assert_includes response["access-control-allow-headers"], "content-type"
    end
  end

  test "development preserves configured origins without accepting unrelated origins" do
    origin = "http://192.168.1.10:5173"
    assert_equal origin, preflight(origin, development: true, configured: " #{origin} ")["access-control-allow-origin"]
    %w[https://untrusted.example http://localhost.evil.example:5174 http://localhost:9999].each do |untrusted|
      assert_nil preflight(untrusted, development: true)["access-control-allow-origin"]
    end
  end

  test "hosted environments only accept configured origins" do
    configured = "https://davar.bible"
    assert_equal configured, preflight(configured, development: false, configured: configured)["access-control-allow-origin"]
    %w[http://localhost:5174 http://127.0.0.1:5173 http://0.0.0.0:5174].each do |local|
      assert_nil preflight(local, development: false, configured: configured)["access-control-allow-origin"]
    end
  end
end

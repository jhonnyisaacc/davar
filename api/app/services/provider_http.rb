require "net/http"
class ProviderHttp
  def self.json(url, method: :get, form: nil, body: nil, headers: {}, basic: nil)
    uri = URI(url)
    raise DomainError.new("invalid_provider_url") unless uri.scheme == "https"
    request = method == :post ? Net::HTTP::Post.new(uri) : Net::HTTP::Get.new(uri)
    headers.each { |key, value| request[key] = value }
    request.basic_auth(*basic) if basic
    request.set_form_data(form) if form
    if body
      request["Content-Type"] = "application/json"
      request.body = JSON.generate(body)
    end
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 30) { |http| http.request(request) }
    raise DomainError.new("provider_unavailable", 503) unless response.is_a?(Net::HTTPSuccess)
    JSON.parse(response.body)
  rescue JSON::ParserError, Timeout::Error, SocketError, IOError, SystemCallError
    raise DomainError.new("provider_unavailable", 503)
  end
end

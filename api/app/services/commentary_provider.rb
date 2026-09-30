class CommentaryProvider
  def self.supported?(provider)
    %w[claude grok chatgpt gemini].include?(provider)
  end
  def self.generate(provider:, credential:, model:, system:, messages:)
    raise DomainError.new("provider_not_supported", 503) unless supported?(provider)
    return DevelopmentSandbox.generate(messages: messages) if DevelopmentSandbox.enabled?
    case provider
    when "claude"
      result = ProviderHttp.json("https://api.anthropic.com/v1/messages", method: :post,
        headers: {"x-api-key" => credential, "anthropic-version" => "2023-06-01"},
        body: {model: model, max_tokens: 2000, system: system, messages: messages})
      result.fetch("content").select { |item| item["type"] == "text" }.map { |item| item["text"] }.join("
")
    when "gemini"
      result = ProviderHttp.json("https://generativelanguage.googleapis.com/v1beta/models/#{ERB::Util.url_encode(model)}:generateContent",
        method: :post, headers: {"x-goog-api-key" => credential},
        body: {systemInstruction: {parts: [{text: system}]},
          contents: messages.map { |m| {role: m[:role] == "assistant" ? "model" : "user", parts: [{text: m[:content]}]} }})
      result.fetch("candidates").first.fetch("content").fetch("parts").map { |p| p["text"] }.join("
")
    else
      base = provider == "grok" ? "https://api.x.ai/v1" : "https://api.openai.com/v1"
      result = ProviderHttp.json("#{base}/chat/completions", method: :post,
        headers: {"Authorization" => "Bearer #{credential}"},
        body: {model: model, messages: [{role: "system", content: system}] + messages})
      result.fetch("choices").first.fetch("message").fetch("content")
    end
  rescue KeyError, NoMethodError
    raise DomainError.new("invalid_provider_response", 503)
  end
end

class DevelopmentController < ActionController::API
  before_action do
    head :not_found unless DevelopmentSandbox.enabled? && request.local?
    response.set_header("Cache-Control", "no-store")
  end
  def status
    openrouter = CommentaryProvider.development_openrouter?
    simulations = %w[cities articles calendar-fixtures]
    simulations.unshift("ai") unless openrouter
    render json: {sandbox: true, simulations: simulations, commentary_provider: openrouter ? "openrouter" : "simulation", mailbox_url: "#{request.base_url}/development/mailbox"}
  end
  def mailbox
    directory = Rails.root.join("tmp/sandbox-mail")
    messages = directory.exist? ? directory.glob("*.json").map { |path| JSON.parse(path.read) }.sort_by { |message| message["created_at"] }.reverse.first(50) : []
    escape = ->(text) { ERB::Util.html_escape(text) }
    cards = messages.map do |message|
      url = message["body"].split.find { |word| word.start_with?("http://", "https://") }
      "<article><h2>#{escape.call(message['to'].join(', '))}</h2><p>#{escape.call(message['subject'])}</p><p>#{escape.call(message['created_at'])}</p><a href=\"#{escape.call(url)}\">Open magic link</a><details><summary>Email body</summary><pre>#{escape.call(message['body'])}</pre></details></article>"
    end.join
    html = "<!doctype html><html lang=\"en\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Davar development inbox</title><style>body{font:16px system-ui;background:#FAF6F0;max-width:800px;margin:auto;padding:24px}article{padding:20px;margin:16px 0;border:1px solid #ddd;border-radius:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#4C72A8}</style><h1>Development inbox</h1><p>Synthetic accounts only. Links expire after ten minutes and can be used once.</p><p><a href=\"/development/mailbox\">Refresh inbox</a></p>#{cards.presence || '<p>No messages yet. Request an email sign-in using fresh@example.test.</p>'}</html>"
    render html: html.html_safe
  end
end

class MagicLinkMailer < ApplicationMailer
  def sign_in(attempt, state)
    @url = "#{ENV.fetch("API_PUBLIC_URL", "http://localhost:3000")}/api/v1/auth/email/callback?state=#{ERB::Util.url_encode(state)}"
    mail(to: attempt.email, from: ENV.fetch("MAIL_FROM", "Davar <sign-in@localhost>"), subject: "Sign in to Davar", body: "Open this link to sign in to Davar. It expires in 10 minutes and can be used once.

#{@url}", content_type: "text/plain")
  end
end

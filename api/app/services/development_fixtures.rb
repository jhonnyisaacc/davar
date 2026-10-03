class DevelopmentFixtures
  EMAILS = %w[fresh starting reader applicant leader-one leader-two].map { |name| "#{name}@example.test" }.freeze
  INVITATION = "DAVAR-LOCAL"
  def self.reset!
    DevelopmentSandbox.require_enabled!
    User.transaction do
      users = Identity.where(provider: "email", subject: EMAILS).map(&:user)
      Assembly.where(source_id: %w[sandbox:local sandbox:online]).or(Assembly.where(leader_id: users.map(&:id))).destroy_all
      AuthAttempt.where(provider: "email").find_each { |attempt| attempt.destroy! if EMAILS.include?(attempt.email) || users.any? { |user| user.id == attempt.user_id } }
      AuthAttempt.where(user_id: users.map(&:id)).delete_all
      users.each { |user| Endorsement.where("applicant_id = ? OR leader_id = ?", user.id, user.id).delete_all; user.destroy! }
      Article.where("source_id LIKE ?", "sandbox:%").destroy_all
      NewMoonObservation.where("source_id LIKE ?", "sandbox:%").destroy_all
      CalendarFeedState.current.update!(development_scenario: "live")
      AccessCode.where(code_digest: AccessCode.digest(INVITATION)).delete_all
    end
    Rails.root.join("tmp/sandbox-mail").glob("*.json").each(&:delete)
    seed!
  end
  def self.seed!
    DevelopmentSandbox.require_enabled!
    User.transaction do
      EMAILS.each do |email|
        next if Identity.exists?(provider: "email", subject: email)
        name = email.split("@").first
        user = Accounts.resolve!(provider: "email", subject: email)
        path = name == "starting" ? "starting" : name.start_with?("leader") || name == "applicant" ? "leader" : "experienced"
        profile = name == "fresh" ? {} : {experience: path, city: "Buenos Aires", latitude: -34.6, longitude: -58.4, gender: "male", visibility_reviewed: true, answers: (path == "starting" ? [1,3] : (1..7).to_a).to_h { |number| [number.to_s, true] }}
        user.update!(display_name: "Sandbox #{name}", profile: profile, admitted_at: name == "fresh" ? nil : Time.current, leader_verified: name.start_with?("leader"), discoverable: false)
      end
      code = AccessCode.find_or_initialize_by(code_digest: AccessCode.digest(INVITATION))
      code.update!(expires_at: 30.days.from_now, max_uses: 100) if code.new_record? || code.expires_at <= Time.current
      leaders = %w[leader-one leader-two].map { |name| Identity.find_by!(provider: "email", subject: "#{name}@example.test").user }
      [ ["sandbox:local", "Sandbox Buenos Aires", "in_person", leaders[0]], ["sandbox:online", "Sandbox Online", "online", leaders[1]] ].each do |id, name, kind, leader|
        next if Assembly.exists?(source_id: id)
        assembly = Assembly.create!(source_id: id, name: name, kind: kind, leader: leader, city: kind == "in_person" ? "Buenos Aires" : nil, latitude: kind == "in_person" ? -34.6 : nil, longitude: kind == "in_person" ? -58.4 : nil, meeting_url: "https://example.test/synthetic-meeting")
        Membership.create!(user: leader, assembly: assembly, state: "member")
      end
      reader = Identity.find_by!(provider: "email", subject: "reader@example.test").user
      local = Assembly.find_by!(source_id: "sandbox:local")
      Membership.find_or_create_by!(user: reader, assembly: local) { |membership| membership.state = "requested" }
      Article.find_or_create_by!(source_id: "sandbox:article") do |article|
        article.assign_attributes(title: "Development article — synthetic content", locale: "en", source_url: "https://example.test/sandbox/article", attribution: "Davar development fixture; not Shaul or Scripture", revision: "fixture-v1", input_hash: Digest::SHA256.hexdigest("fixture-v1"), publication_state: "published", permissions: {public_display: true, ai_grounding: true}, references: [{system_id: "davar-v1", kind: "verse", book_id: "john", chapter: 1, verse: 1}], body: "Synthetic article for testing display, attribution and source handoff. No theological claim is made.")
      end
    end
    {accounts: EMAILS, invitation: INVITATION, provider_key: "sandbox-key", provider_model: "development-fixture-v1"}
  end
  def self.calendar!(scenario)
    DevelopmentSandbox.require_enabled!
    raise "Choose live, pending or confirmed" unless scenario.in?(%w[live pending confirmed])
    CalendarFeedState.current.update!(development_scenario: scenario)
    NewMoonObservation.where("source_id LIKE ?", "sandbox:%").destroy_all
    if scenario == "confirmed"
      day = Date.current - 4
      observation = NewMoonObservation.create!(source_id: "sandbox:synthetic-observation", source: "israeli_new_moon_society", source_url: "https://example.test/synthetic-observation", observed_on: day, country: "IL", visibility_method: "unaided", verified: true, input_hash: Digest::SHA256.hexdigest(day.iso8601), provenance: {development_fixture: true, observer: "Synthetic fixture — not a real INMS observation"})
    end
    {scenario: scenario, synthetic: scenario != "live", aviv: "unresolved"}
  end
end

class DevelopmentFixtures
  # Synthetic personas are deliberately separate from imported or real accounts.
  ASSEMBLIES_SCENARIOS = {
    "fresh" => "Invitation required; no onboarding",
    "onboarding-path" => "Admitted; choose a path",
    "onboarding-questions" => "Experienced path; resume after question 2",
    "onboarding-name" => "Answers complete; name and gender required",
    "onboarding-city" => "Name and gender complete; city required",
    "onboarding-visibility" => "City selected; visibility review required",
    "starting" => "Starting path; may browse but cannot join",
    "reader" => "Join request pending in local assembly",
    "female-reader" => "Experienced female reader; eligible to join",
    "disagreed" => "One negative answer; excluded from people discovery",
    "member" => "Local member; meeting access; cannot join elsewhere",
    "declined" => "Declined local request; may request again",
    "left" => "Left local assembly; may request again",
    "pending-online" => "Online request pending",
    "legacy-city" => "City label without coordinates; must select a city",
    "applicant" => "Unverified leader; request two endorsements",
    "applicant-pending" => "Two pending endorsements",
    "applicant-one" => "One accepted and one pending endorsement",
    "applicant-declined" => "Declined endorsement; support required",
    "leader-one" => "Verified local leader with members and requests",
    "leader-two" => "Verified online leader with requests",
    "leader-create" => "Verified leader without an assembly; can create",
    "nearby-hidden" => "Jerusalem; hidden from people discovery",
    "nearby-visible" => "Jerusalem; discoverable name and city only",
    "nearby-contact" => "Jerusalem; discoverable with synthetic Telegram contact"
  }.freeze
  EMAILS = ASSEMBLIES_SCENARIOS.keys.map { |name| "#{name}@example.test" }.freeze
  INVALID_INVITATIONS = {"EXPIRE1" => :expired, "REVOKE1" => :revoked, "USED001" => :exhausted}.freeze
  INVITATION = "DAVAR01"
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
      AccessCode.where(code_digest: [INVITATION, *INVALID_INVITATIONS.keys].map { |value| AccessCode.digest(value) }).delete_all
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
        path = name == "starting" ? "starting" : name.start_with?("leader", "applicant") ? "leader" : "experienced"
        profile = name == "fresh" ? {} : {experience: path, city: "Buenos Aires", latitude: -34.6, longitude: -58.4, gender: "male", visibility_reviewed: true, answers: (path == "starting" ? [1,3] : (1..7).to_a).to_h { |number| [number.to_s, true] }}
        case name
        when "onboarding-path" then profile = {}
        when "onboarding-questions" then profile = {experience: path, answers: {"1" => true, "2" => false}}
        when "onboarding-name" then profile = {experience: path, answers: (1..7).to_h { |number| [number.to_s, true] }}
        when "onboarding-city" then profile.delete(:city); profile.delete(:latitude); profile.delete(:longitude); profile.delete(:visibility_reviewed)
        when "onboarding-visibility" then profile.delete(:visibility_reviewed)
        when "female-reader" then profile[:gender] = "female"
        when "disagreed" then profile[:answers]["2"] = false
        when "legacy-city" then profile.delete(:latitude); profile.delete(:longitude)
        end
        profile.merge!(city: "Jerusalem", latitude: 31.8, longitude: 35.25) if name.start_with?("nearby-")
        profile[:birth_date] = "1990-01-01" if name == "reader"
        user.update!(display_name: "Sandbox #{name}", profile: profile, admitted_at: name == "fresh" ? nil : Time.current, leader_verified: name.start_with?("leader"), discoverable: %w[nearby-visible nearby-contact].include?(name), contact_visible: name == "nearby-contact")
        Identity.create!(user: user, provider: "telegram", subject: "990000000001") if name == "nearby-contact"
      end
      code = AccessCode.find_or_initialize_by(code_digest: AccessCode.digest(INVITATION))
      code.update!(expires_at: 30.days.from_now, max_uses: 100) if code.new_record? || code.expires_at <= Time.current
      leaders = %w[leader-one leader-two].map { |name| Identity.find_by!(provider: "email", subject: "#{name}@example.test").user }
      [ ["sandbox:local", "Sandbox Buenos Aires", "in_person", leaders[0]], ["sandbox:online", "Sandbox Online", "online", leaders[1]] ].each do |id, name, kind, leader|
        next if Assembly.exists?(source_id: id)
        assembly = Assembly.create!(source_id: id, name: name, kind: kind, leader: leader, city: kind == "in_person" ? "Buenos Aires" : nil, latitude: kind == "in_person" ? -34.6 : nil, longitude: kind == "in_person" ? -58.4 : nil, meeting_url: "https://example.test/synthetic-meeting")
        Membership.create!(user: leader, assembly: assembly, state: "member")
      end
      INVALID_INVITATIONS.each do |value, state|
        AccessCode.find_or_create_by!(code_digest: AccessCode.digest(value)) do |invalid|
          invalid.assign_attributes(expires_at: state == :expired ? 1.day.ago : 30.days.from_now, revoked_at: state == :revoked ? Time.current : nil, max_uses: 1, uses: state == :exhausted ? 1 : 0)
        end
      end
      reader = Identity.find_by!(provider: "email", subject: "reader@example.test").user
      local = Assembly.find_by!(source_id: "sandbox:local")
      Membership.find_or_create_by!(user: reader, assembly: local) { |membership| membership.state = "requested" }
      {"member" => "member", "declined" => "declined", "left" => "left"}.each do |name, state|
        user = Identity.find_by!(provider: "email", subject: "#{name}@example.test").user
        Membership.find_or_create_by!(user: user, assembly: local) { |membership| membership.state = state }
      end
      online = Assembly.find_by!(source_id: "sandbox:online")
      pending = Identity.find_by!(provider: "email", subject: "pending-online@example.test").user
      Membership.find_or_create_by!(user: pending, assembly: online) { |membership| membership.state = "requested" }
      {"applicant-pending" => %w[requested requested], "applicant-one" => %w[accepted requested], "applicant-declined" => %w[declined requested]}.each do |name, states|
        applicant = Identity.find_by!(provider: "email", subject: "#{name}@example.test").user
        leaders.zip(states).each do |leader, state|
          Endorsement.find_or_create_by!(applicant: applicant, leader: leader) { |endorsement| endorsement.state = state }
        end
      end
      Article.find_or_create_by!(source_id: "sandbox:article") do |article|
        article.assign_attributes(title: "Development article — synthetic content", locale: "en", source_url: "https://example.test/sandbox/article", attribution: "Davar development fixture; not Shaul or Scripture", revision: "fixture-v1", input_hash: Digest::SHA256.hexdigest("fixture-v1"), publication_state: "published", permissions: {public_display: true, ai_grounding: true}, references: [{system_id: "davar-v1", kind: "verse", book_id: "john", chapter: 1, verse: 1}], body: "Synthetic article for testing display, attribution and source handoff. No theological claim is made.")
      end
    end
    {accounts: EMAILS, assemblies_scenarios: ASSEMBLIES_SCENARIOS, invitation: INVITATION, invalid_invitations: INVALID_INVITATIONS, provider_key: "sandbox-key", provider_model: "development-fixture-v1"}
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

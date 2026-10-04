require "test_helper"

class AssembliesTest < ActionDispatch::IntegrationTest
  include EnabledProductFeatures
  setup do
    @sandbox_enabled = DevelopmentSandbox.method(:enabled?)
    DevelopmentSandbox.define_singleton_method(:enabled?) { true }
    @invite_gate = ENV["INVITE_GATE_ENABLED"]
    ENV["INVITE_GATE_ENABLED"] = "true"
    DevelopmentFixtures.seed!
  end

  teardown do
    DevelopmentSandbox.define_singleton_method(:enabled?, @sandbox_enabled)
    ENV["INVITE_GATE_ENABLED"] = @invite_gate
  end

  def persona(name)
    Identity.find_by!(provider: "email", subject: "#{name}@example.test").user
  end

  def login(name)
    _, token = Session.issue!(name.is_a?(User) ? name : persona(name))
    {"Authorization" => "Bearer #{token}"}
  end

  def local_assembly
    Assembly.find_by!(source_id: "sandbox:local")
  end

  def online_assembly
    Assembly.find_by!(source_id: "sandbox:online")
  end

  def error(code, status)
    assert_response status
    assert_equal code, response.parsed_body.dig("error", "code")
  end

  test "anonymous guest unadmitted and incomplete accounts cannot access Assemblies" do
    get "/api/v1/assemblies", params: {kind: "online"}
    error "authentication_required", :unauthorized
    get "/api/v1/assemblies", params: {kind: "online"}, headers: login(User.create!)
    error "registered_account_required", :forbidden
    get "/api/v1/assemblies", params: {kind: "online"}, headers: login("fresh")
    error "admission_required", :forbidden
    get "/api/v1/assemblies", params: {kind: "online"}, headers: login("onboarding-path")
    error "onboarding_required", :forbidden
  end

  test "admission normalizes the code and consumes it once per account" do
    headers = login("fresh")
    code = AccessCode.find_by!(code_digest: AccessCode.digest(DevelopmentFixtures::INVITATION))
    2.times do
      post "/api/v1/account/admission", params: {code: " 123-4567 "}, headers: headers, as: :json
      assert_response :success
      assert response.parsed_body["admitted"]
    end
    assert_equal 1, code.reload.uses
    assert persona("fresh").reload.admitted_at
    assert_not response.parsed_body["onboarding_complete"]
  end

  test "invalid expired revoked and exhausted invitations do not admit an account" do
    headers = login("fresh")
    ["WRONG01", *DevelopmentFixtures::INVALID_INVITATIONS.keys, "", nil].each do |code|
      post "/api/v1/account/admission", params: {code: code}, headers: headers, as: :json
      error "invalid_code", :forbidden
      assert_nil persona("fresh").reload.admitted_at
    end
  end

  test "seven-digit invitations retain leading zeroes across repeated redemption" do
    headers = login("fresh")
    code = AccessCode.create!(code_digest: AccessCode.digest("0000427"), expires_at: 1.day.from_now, max_uses: 2)
    2.times do
      post "/api/v1/account/admission", params: {code: "0000427"}, headers: headers, as: :json
      assert_response :success
      assert response.parsed_body["admitted"]
    end
    assert_equal 1, code.reload.uses
  end

  test "a false profile payload preserves the profile while updating account attributes" do
    reader = persona("reader")
    profile = reader.profile
    patch "/api/v1/account", params: {profile: false, display_name: "Updated Reader"}, headers: login(reader), as: :json
    assert_response :success
    assert_equal profile, reader.reload.profile
    assert_equal "Updated Reader", reader.display_name
  end

  test "onboarding saves a negative answer and resumes before city and visibility" do
    user = persona("onboarding-path")
    headers = login(user)
    patch "/api/v1/account", params: {profile: {experience: "experienced"}}, headers: headers, as: :json
    assert_response :success
    answers = (1..7).to_h { |number| [number.to_s, number != 2] }
    patch "/api/v1/account", params: {display_name: "QA reader", profile: {answers: answers, gender: "female"}}, headers: headers, as: :json
    assert_response :success
    assert_not response.parsed_body["onboarding_complete"]
    assert_equal false, response.parsed_body.dig("profile", "answers", "2")
    selection = DevelopmentSandbox.cities("Buenos").first[:selection]
    patch "/api/v1/account/city", params: {selection: selection}, headers: headers, as: :json
    assert_response :success
    patch "/api/v1/account", params: {profile: {visibility_reviewed: true}}, headers: headers, as: :json
    assert_response :success
    assert response.parsed_body["onboarding_complete"]
    assert_not user.reload.doctrinal_agreement?
    assert_not user.discoverable
    assert_not user.contact_visible
  end

  test "profile cannot forge admission leader verification or city coordinates" do
    headers = login("onboarding-path")
    patch "/api/v1/account", params: {admitted: true, leader_verified: true, profile: {city: "Forged", latitude: 0, longitude: 0}}, headers: headers, as: :json
    assert_response :success
    assert_not response.parsed_body["leader_verified"]
    assert_nil response.parsed_body.dig("profile", "city")
    assert_nil response.parsed_body.dig("profile", "latitude")
    patch "/api/v1/account/city", params: {selection: "tampered"}, headers: headers, as: :json
    error "invalid_city_selection", :unprocessable_entity
  end

  test "invalid answers and female leadership retain domain constraints" do
    headers = login("starting")
    [{"2" => true}, {"1" => "true"}].each do |answers|
      patch "/api/v1/account", params: {profile: {answers: answers}}, headers: headers, as: :json
      error "invalid_answers", :unprocessable_entity
    end
    patch "/api/v1/account", params: {profile: {gender: "female"}}, headers: login("leader-one"), as: :json
    error "female_leader_forbidden", :unprocessable_entity
    post "/api/v1/assemblies/#{local_assembly.id}/join", headers: headers
    error "starting_cannot_join", :forbidden
  end

  test "local discovery respects radius online separation and private meeting details" do
    get "/api/v1/assemblies", params: {kind: "in_person", latitude: -34.6, longitude: -58.4, radius_km: 10}, headers: login("female-reader")
    assert_response :success
    assert_equal [local_assembly.id], response.parsed_body["assemblies"].map { |item| item["id"] }
    assert_nil response.parsed_body["assemblies"].first["meeting_url"]
    assert_equal 0.0, response.parsed_body["assemblies"].first["distance_km"]
    assert_equal "no-store", response.headers["Cache-Control"]
    get "/api/v1/assemblies", params: {kind: "online"}, headers: login("female-reader")
    assert_response :success
    assert_equal [online_assembly.id], response.parsed_body["assemblies"].map { |item| item["id"] }
  end

  test "local discovery accepts zero coordinates and rejects malformed areas" do
    headers = login("female-reader")
    get "/api/v1/assemblies", params: {kind: "in_person", latitude: 0, longitude: 0, radius_km: 25}, headers: headers
    assert_response :success
    [{latitude: 91, longitude: 0}, {latitude: 0, longitude: 181}, {latitude: "NaN", longitude: 0}, {latitude: 0, longitude: 0, radius_km: 1}, {latitude: "", longitude: ""}].each do |area|
      get "/api/v1/assemblies", params: {kind: "in_person"}.merge(area), headers: headers
      error "invalid_area", :unprocessable_entity
    end
    get "/api/v1/assemblies", params: {kind: "unknown"}, headers: headers
    error "invalid_kind", :unprocessable_entity
  end

  test "nearby people honor discovery admission agreement and contact consent" do
    persona("disagreed").update!(discoverable: true, profile: persona("disagreed").profile.merge("latitude" => 31.8, "longitude" => 35.25))
    fresh = persona("fresh")
    fresh.update!(discoverable: true, profile: persona("nearby-visible").profile)
    get "/api/v1/assemblies", params: {kind: "in_person", latitude: 31.8, longitude: 35.25, radius_km: 10}, headers: login("female-reader")
    assert_response :success
    people = response.parsed_body["people"]
    assert_equal %w[Sandbox\ nearby-contact Sandbox\ nearby-visible].sort, people.map { |person| person["name"] }.sort
    assert_nil people.find { |person| person["name"] == "Sandbox nearby-visible" }["contact_url"]
    assert_match(/\Atg:\/\/user\?id=\d+\z/, people.find { |person| person["name"] == "Sandbox nearby-contact" }["contact_url"])
    assert people.all? { |person| (person.keys & %w[latitude longitude gender birth_date identities]).empty? }
  end

  test "join retries are idempotent and cancellation can request again" do
    user = persona("female-reader")
    headers = login(user)
    2.times do
      post "/api/v1/assemblies/#{local_assembly.id}/join", headers: headers
      assert_response :success
      assert_equal "requested", response.parsed_body["state"]
    end
    assert_equal 1, user.memberships.count
    assert_equal 1, local_assembly.leader.notifications.where(kind: "join_requested").count
    delete "/api/v1/assemblies/#{local_assembly.id}/leave", headers: headers
    assert_response :no_content
    assert_equal "left", user.memberships.first.reload.state
    post "/api/v1/assemblies/#{local_assembly.id}/join", headers: headers
    assert_response :success
    assert_equal "requested", user.memberships.first.reload.state
  end

  test "declined and left members can submit a new request" do
    %w[declined left].each do |name|
      post "/api/v1/assemblies/#{local_assembly.id}/join", headers: login(name)
      assert_response :success
      assert_equal "requested", response.parsed_body["state"]
    end
  end

  test "only the leader can decide a pending request and retries do not notify again" do
    membership = persona("reader").memberships.find_by!(assembly: local_assembly)
    post "/api/v1/assemblies/#{local_assembly.id}/memberships/#{membership.id}/decision", params: {decision: "accepted"}, headers: login("leader-two"), as: :json
    error "not_found", :not_found
    headers = login("leader-one")
    post "/api/v1/assemblies/#{local_assembly.id}/memberships/#{membership.id}/decision", params: {decision: "accepted"}, headers: headers, as: :json
    assert_response :success
    assert_equal "member", membership.reload.state
    assert_equal 1, membership.user.notifications.where(kind: "join_accepted").count
    post "/api/v1/assemblies/#{local_assembly.id}/memberships/#{membership.id}/decision", params: {decision: "declined"}, headers: headers, as: :json
    error "request_not_pending", :conflict
    assert_equal 1, membership.user.notifications.where(kind: "join_accepted").count
  end

  test "membership decision cannot target a request from another assembly" do
    membership = persona("pending-online").memberships.first
    post "/api/v1/assemblies/#{local_assembly.id}/memberships/#{membership.id}/decision", params: {decision: "accepted"}, headers: login("leader-one"), as: :json
    error "not_found", :not_found
    assert_equal "requested", membership.reload.state
  end

  test "membership decline keeps the meeting private and only active people are listed" do
    membership = persona("reader").memberships.first
    post "/api/v1/assemblies/#{local_assembly.id}/memberships/#{membership.id}/decision", params: {decision: "declined"}, headers: login("leader-one"), as: :json
    assert_response :success
    get "/api/v1/assemblies/#{local_assembly.id}", headers: login("reader")
    assert_response :success
    assert_equal "not_member", response.parsed_body["member_state"]
    assert_nil response.parsed_body["meeting_url"]
    get "/api/v1/assemblies/#{local_assembly.id}/members", headers: login("leader-one")
    assert_response :success
    assert response.parsed_body["memberships"].all? { |item| item["state"] == "member" }
  end

  test "meeting access is revoked when a member leaves and a leader cannot leave" do
    headers = login("member")
    get "/api/v1/assemblies/#{local_assembly.id}", headers: headers
    assert_response :success
    assert response.parsed_body["meeting_url"]
    delete "/api/v1/assemblies/#{local_assembly.id}/leave", headers: headers
    assert_response :no_content
    get "/api/v1/assemblies/#{local_assembly.id}", headers: headers
    assert_response :success
    assert_nil response.parsed_body["meeting_url"]
    delete "/api/v1/assemblies/#{local_assembly.id}/leave", headers: login("leader-one")
    error "leader_cannot_leave", :conflict
  end

  test "account membership identifies the active assembly and clears when leaving" do
    headers = login("member")
    get "/api/v1/account", headers: headers
    assert_response :success
    assert_equal local_assembly.id, response.parsed_body["active_assembly_id"]
    delete "/api/v1/assemblies/#{local_assembly.id}/leave", headers: headers
    assert_response :success
    get "/api/v1/account", headers: headers
    assert_response :success
    assert_nil response.parsed_body["active_assembly_id"]
  end
  test "a member cannot join or be accepted elsewhere" do
    user = persona("member")
    post "/api/v1/assemblies/#{online_assembly.id}/join", headers: login(user)
    error "already_member_elsewhere", :conflict
    membership = Membership.create!(user: user, assembly: online_assembly, state: "requested")
    post "/api/v1/assemblies/#{online_assembly.id}/memberships/#{membership.id}/decision", params: {decision: "accepted"}, headers: login("leader-two"), as: :json
    error "already_member_elsewhere", :conflict
    assert_equal "requested", membership.reload.state
  end

  test "members and management never expose another assembly or hidden Telegram contacts" do
    get "/api/v1/assemblies/#{local_assembly.id}/members", headers: login("member")
    error "not_found", :not_found
    user = persona("reader")
    Identity.create!(user: user, provider: "telegram", subject: "990000000002")
    get "/api/v1/assemblies/#{local_assembly.id}/members", headers: login("leader-one")
    assert_response :success
    person = response.parsed_body["memberships"].find { |item| item["user"]["id"] == user.id }["user"]
    assert_nil person["contact_url"]
    assert_equal "male", person["gender"]
    assert person["age"].is_a?(Integer)
    user.update!(contact_visible: true)
    get "/api/v1/assemblies/#{local_assembly.id}/members", headers: login("leader-one")
    assert_equal "tg://user?id=990000000002", response.parsed_body["memberships"].find { |item| item["user"]["id"] == user.id }.dig("user", "contact_url")
  end

  test "creation requires a verified leader and uses signed profile location" do
    post "/api/v1/assemblies", params: {name: "Forbidden", kind: "online"}, headers: login("applicant"), as: :json
    error "leader_verification_required", :forbidden
    headers = login("leader-create")
    post "/api/v1/assemblies", params: {name: "QA created", kind: "in_person", city: "Forged", latitude: 0, longitude: 0, meeting_url: "https://example.test/meeting"}, headers: headers, as: :json
    assert_response :created
    assert_equal "Buenos Aires", response.parsed_body["city"]
    assert response.parsed_body["can_manage"]
    assert_equal "member", response.parsed_body["member_state"]
    assert_equal(-34.6, Assembly.find(response.parsed_body["id"]).latitude.to_f)
    post "/api/v1/assemblies", params: {name: "Second", kind: "online"}, headers: headers, as: :json
    error "already_member_elsewhere", :conflict
  end

  test "management validates a complete HTTPS meeting URL and cannot change location or kind" do
    headers = login("leader-one")
    ["javascript:alert(1)", "http://example.test", "https://", "https:// bad"].each do |url|
      patch "/api/v1/assemblies/#{local_assembly.id}", params: {meeting_url: url}, headers: headers, as: :json
      error "validation_failed", :unprocessable_entity
    end
    patch "/api/v1/assemblies/#{local_assembly.id}", params: {name: "QA edited", kind: "online", city: "Forged", latitude: 0, longitude: 0, meeting_url: ""}, headers: headers, as: :json
    assert_response :success
    assert_equal "in_person", response.parsed_body["kind"]
    assert_equal "Buenos Aires", response.parsed_body["city"]
    assert_nil response.parsed_body["meeting_url"].presence
    patch "/api/v1/assemblies/#{local_assembly.id}", params: {name: "Other leader"}, headers: login("leader-two"), as: :json
    error "not_found", :not_found
  end

  test "two independent endorsements verify a leader and create notification records" do
    applicant = persona("applicant-one")
    endorsement = applicant.id.then { |id| Endorsement.find_by!(applicant_id: id, state: "requested") }
    patch "/api/v1/endorsements/#{endorsement.id}", params: {state: "accepted"}, headers: login("leader-two"), as: :json
    assert_response :success
    assert applicant.reload.leader_verified
    assert_equal 1, applicant.notifications.where(kind: "endorsement_accepted").count
    patch "/api/v1/endorsements/#{endorsement.id}", params: {state: "accepted"}, headers: login("leader-two"), as: :json
    error "request_not_pending", :conflict
    get "/api/v1/account", headers: login(applicant)
    assert response.parsed_body["leader_verified"]
  end

  test "endorsement declines require support and non-leaders cannot request verification" do
    post "/api/v1/endorsements", params: {leader_id: persona("leader-create").id}, headers: login("applicant-declined"), as: :json
    error "contact_support", :conflict
    post "/api/v1/endorsements", params: {leader_id: persona("leader-one").id}, headers: login("female-reader"), as: :json
    error "onboarding_required", :forbidden
    post "/api/v1/endorsements", params: {leader_id: persona("female-reader").id}, headers: login("applicant"), as: :json
    error "invalid_endorser", :unprocessable_entity
    post "/api/v1/endorsements", params: {leader_id: persona("leader-create").id}, headers: login("applicant-pending"), as: :json
    error "two_endorsers_maximum", :conflict
  end

  test "duplicate endorsements foreign decisions and invalid states do not change verification" do
    headers = login("applicant")
    2.times do |index|
      post "/api/v1/endorsements", params: {leader_id: persona("leader-one").id}, headers: headers, as: :json
      assert_response(index.zero? ? :created : :conflict)
    end
    endorsement = Endorsement.find_by!(applicant: persona("applicant"))
    patch "/api/v1/endorsements/#{endorsement.id}", params: {state: "accepted"}, headers: login("leader-two"), as: :json
    error "not_found", :not_found
    patch "/api/v1/endorsements/#{endorsement.id}", params: {state: "unknown"}, headers: login("leader-one"), as: :json
    error "invalid_decision", :unprocessable_entity
    assert_not persona("applicant").reload.leader_verified
  end

  test "contact sharing requires Telegram and notifications belong to their recipient" do
    patch "/api/v1/account", params: {contact_visible: true}, headers: login("reader"), as: :json
    error "telegram_contact_required", :unprocessable_entity
    post "/api/v1/assemblies/#{local_assembly.id}/join", headers: login("female-reader")
    assert_response :success
    get "/api/v1/account/notifications", headers: login("leader-two")
    assert_response :success
    assert_empty response.parsed_body["notifications"]
    get "/api/v1/account/notifications", headers: login("leader-one")
    assert_equal ["join_requested"], response.parsed_body["notifications"].map { |item| item["kind"] }
  end
end

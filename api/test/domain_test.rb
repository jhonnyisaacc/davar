require "test_helper"
class DomainTest < ActiveSupport::TestCase
  include EnabledProductFeatures
  def reader(**attributes)
    User.create!({display_name: "Reader", admitted_at: Time.current, profile: {experience: "experienced", city: "Buenos Aires", gender: "male", visibility_reviewed: true, answers: (1..7).to_h { |n| [n.to_s, true] }}}.merge(attributes))
  end
  test "identities use provider subjects and explicit linking" do
    google = Accounts.resolve!(provider: "google", subject: "subject-1")
    same = Accounts.resolve!(provider: "google", subject: "subject-1")
    assert_equal google, same
    assert_equal google, Accounts.resolve!(provider: "apple", subject: "apple-1", linking_user: google)
    other = reader
    assert_raises(DomainError) { Accounts.resolve!(provider: "google", subject: "subject-1", linking_user: other) }
    assert_equal 2, google.identities.count
    assert_not_includes Identity.first.read_attribute_before_type_cast(:subject), "subject-1"
  end
  test "sessions expire and revoke" do
    user = reader
    session, token = Session.issue!(user)
    assert_equal session, Session.authenticate(token)
    assert_nil Session.authenticate("wrong")
    session.update!(revoked_at: Time.current)
    assert_nil Session.authenticate(token)
    session.update!(revoked_at: nil, expires_at: 1.minute.ago)
    assert_nil Session.authenticate(token)
  end
  test "magic links and handoffs are single use" do
    Authentication.start!(provider: "email", return_uri: "davar://auth/callback", email: "reader@example.org")
    email = ActionMailer::Base.deliveries.last
    state = URI.decode_www_form(URI(email.body.to_s[/http[^\s]+/]).query).to_h.fetch("state")
    result = Authentication.finish!(provider: "email", state: state)
    code = URI.decode_www_form(URI(result).query).to_h.fetch("code")
    assert Session.authenticate(Authentication.exchange!(code))
    assert_raises(ActiveRecord::RecordNotFound) { Authentication.exchange!(code) }
    assert_raises(DomainError) { Authentication.finish!(provider: "email", state: state) }
  end
  test "return URIs are allowlisted" do
    assert_raises(DomainError) { Authentication.start!(provider: "email", return_uri: "https://evil.example", email: "a@b.co") }
  end
  test "admission capacity is idempotent and bounded" do
    code = AccessCode.create!(code_digest: AccessCode.digest("test-code"), expires_at: 1.day.from_now, max_uses: 1)
    first, second = reader(admitted_at: nil), reader(admitted_at: nil)
    Admissions.redeem!(first, "testcode")
    Admissions.redeem!(first, "testcode")
    assert_equal 1, code.reload.uses
    assert_raises(DomainError) { Admissions.redeem!(second, "testcode") }
  end
  test "membership acceptance rejects a second assembly" do
    user, leader, other_leader = reader, reader, reader
    first = Assembly.create!(leader: leader, name: "First", kind: "online")
    second = Assembly.create!(leader: other_leader, name: "Second", kind: "online")
    request = AssemblyMemberships.request!(user, first)
    other = AssemblyMemberships.request!(user, second)
    AssemblyMemberships.decide!(leader, request, "accepted")
    assert_raises(DomainError) { AssemblyMemberships.decide!(other_leader, other, "accepted") }
    assert_equal "requested", other.reload.state
    assert_raises(DomainError) { AssemblyMemberships.decide!(other_leader, request, "declined") }
  end
  test "joining is idempotent and starting users cannot join" do
    assembly = Assembly.create!(leader: reader, name: "Qahal", kind: "online")
    user = reader
    assert_equal AssemblyMemberships.request!(user, assembly).id, AssemblyMemberships.request!(user, assembly).id
    starting = reader(profile: {experience: "starting", city: "City", gender: "male", visibility_reviewed: true, answers: {"1"=>true, "3"=>true}})
    assert_raises(DomainError) { AssemblyMemberships.request!(starting, assembly) }
  end
  test "database enforces one active membership" do
    user = reader
    first = Assembly.create!(leader: reader, name: "One", kind: "online")
    second = Assembly.create!(leader: reader, name: "Two", kind: "online")
    Membership.create!(user: user, assembly: first, state: "member")
    assert_raises(ActiveRecord::RecordNotUnique) { Membership.create!(user: user, assembly: second, state: "member") }
  end
  test "settings reject stale versions and invalid values" do
    user = reader
    UserSettings.update!(user, {"language"=>"he"}, 0)
    assert_equal 1, user.settings_version
    assert_raises(DomainError) { UserSettings.update!(user, {"language"=>"es"}, 0) }
    assert_raises(DomainError) { UserSettings.update!(user, {"language"=>"invalid"}, 1) }
  end
  test "word and verse context retain edition identity" do
    context = {"schema_version"=>1, "kind"=>"word", "edition_id"=>"hutter", "token_index"=>0,
      "reference"=>{"system_id"=>"davar-v1", "kind"=>"verse", "book_id"=>"john", "chapter"=>1, "verse"=>1}}
    assert_equal context, CommentaryContext.validate!(context)
    assert_raises(DomainError) { CommentaryContext.validate!(context.merge("token_index"=>-1)) }
    assert_raises(DomainError) { CommentaryContext.validate!(context.except("edition_id")) }
  end
  test "articles require public permission" do
    article = Article.new(source_id: "shaul:note:test", title: "Title", locale: "en", source_url: "https://shaul.vercel.app/test", attribution: "Author", revision: "1", input_hash: "hash", publication_state: "published")
    assert_not article.valid?
    article.permissions = {"public_display"=>true}
    assert article.valid?
  end
  test "aided or unverified observations never confirm months" do
    observation = NewMoonObservation.create!(source_id: "inms:test", source: "israeli_new_moon_society", source_url: "https://moonsocil.blogspot.com/test", input_hash: "hash", observed_on: Date.new(2026,9,12), country: "IL", visibility_method: "aided", verified: true)
    assert_not MonthConfirmation.new(new_moon_observation_id: observation.id, starts_on_evening: observation.observed_on).valid?
    observation.update!(visibility_method: "unaided")
    assert MonthConfirmation.create!(new_moon_observation: observation, starts_on_evening: observation.observed_on)
    result = BiblicalCalendar.call(instant: "2026-09-13T09:00:00Z", latitude: 31.78, longitude: 35.23, timezone: "Asia/Jerusalem")
    assert_equal 1, result["days"][0]["biblical"]["day"]
    assert_nil result["days"][0]["biblical"]["month_id"]
    assert_equal "unresolved", result["year_start_status"]
  end
  test "calendar sunset advances the lookup and missing evidence remains pending" do
    before = BiblicalCalendar.call(instant: "2026-09-30T12:00:00Z", latitude: 31.78, longitude: 35.23, timezone: "Asia/Jerusalem")
    after = BiblicalCalendar.call(instant: "2026-09-30T22:00:00Z", latitude: 31.78, longitude: 35.23, timezone: "Asia/Jerusalem")
    assert_equal "2026-09-30", before["days"][0]["civil_date"]
    assert_equal "2026-10-01", after["days"][0]["civil_date"]
    assert_equal "pending", after["days"][0]["month_status"]
  end
  test "throttling is durable across calls" do
    RateLimit.check!("test", limit: 1)
    assert_raises(DomainError) { RateLimit.check!("test", limit: 1) }
  end
  test "commentary persists provider provenance and retries do not duplicate" do
    user = reader
    ProviderConnection.create!(user: user, provider: "chatgpt", credential: "mock-key", model: "pinned-model")
    conversation = user.conversations.create!(title: "Study")
    commentary_article
    generator = Class.new { def self.generate(**); '{"answer":"Supplied evidence needs verification.","source_ids":["fixture:commentary"]}'; end }
    answer = Commentary.ask!(conversation: conversation, content: "Explain", context: commentary_context, request_id: "request_001", generator: generator)
    assert_equal "generated", answer.generation["material_state"]
    assert_equal "complete", answer.state
    assert conversation.reload.memory.present?
    assert_equal answer, Commentary.ask!(conversation: conversation, content: "Explain", context: nil, request_id: "request_001", generator: generator)
    assert_equal 2, conversation.messages.count
    assert_not_includes answer.read_attribute_before_type_cast(:content), "supplied"
  end
  test "synchronized settings retain single text and Sefer dependencies" do
    user = reader
    UserSettings.update!(user, {"translationOnly"=>true, "showFullChapter"=>true, "seferMode"=>true}, 0)
    UserSettings.update!(user, {"hebrewOnly"=>true}, 1)
    assert_equal false, user.settings["translationOnly"]
    UserSettings.update!(user, {"showFullChapter"=>false}, 2)
    assert_equal false, user.settings["seferMode"]
  end

end

require "test_helper"
require "tmpdir"
require "mail"
class DevelopmentSandboxTest < ActiveSupport::TestCase
  def with_method(target, name, value)
    original = target.method(name)
    target.define_singleton_method(name) { value }
    yield
  ensure
    target.define_singleton_method(name, original)
  end
  test "sandbox flag cannot enable simulations outside development" do
    previous = ENV["DAVAR_DEV_SANDBOX"]
    ENV["DAVAR_DEV_SANDBOX"] = "1"
    assert_not DevelopmentSandbox.enabled?
    assert_raises(RuntimeError) { DevelopmentFixtures.seed! }
  ensure
    ENV["DAVAR_DEV_SANDBOX"] = previous
  end
  test "fixtures repeat and reset only fixture owned records" do
    with_method(DevelopmentSandbox, :enabled?, true) do
      DevelopmentFixtures.seed!
      ids = Identity.where(subject: DevelopmentFixtures::EMAILS).pluck(:user_id).sort
      DevelopmentFixtures.seed!
      assert_equal ids, Identity.where(subject: DevelopmentFixtures::EMAILS).pluck(:user_id).sort
      fresh = Identity.find_by!(subject: "fresh@example.test").user
      assert_nil fresh.admitted_at
      unrelated = User.create!
      Assembly.create!(leader: fresh, name: "Created during testing", kind: "online")
      session, = Session.issue!(fresh)
      DevelopmentFixtures.calendar!("confirmed")
      Dir.mktmpdir do |directory|
        with_method(Rails, :root, Pathname.new(directory)) { DevelopmentFixtures.reset! }
      end
      assert User.exists?(unrelated.id)
      assert_not Session.exists?(session.id)
      assert_equal 6, Identity.where(subject: DevelopmentFixtures::EMAILS).count
      assert_equal 2, Assembly.where("source_id LIKE ?", "sandbox:%").count
      assert_equal "live", CalendarFeedState.current.development_scenario
    end
  end
  test "local mailbox captures synthetic mail and rejects real recipients" do
    with_method(DevelopmentSandbox, :enabled?, true) do
      Dir.mktmpdir do |directory|
        with_method(Rails, :root, Pathname.new(directory)) do
          delivery = DevelopmentMailboxDelivery.new
          delivery.deliver!(Mail.new(to: "fresh@example.test", subject: "Sign in", body: "http://localhost/sign-in"))
          files = Dir.glob("#{directory}/tmp/sandbox-mail/*.json")
          assert_equal 1, files.length
          assert_equal ["fresh@example.test"], JSON.parse(File.read(files.first))["to"]
          assert_equal 0600, File.stat(files.first).mode & 0777
          assert_raises(RuntimeError) { delivery.deliver!(Mail.new(to: "real@example.org", body: "No delivery")) }
        end
      end
    end
  end
  test "simulated failure refunds free consultation while successful retries preserve limits" do
    with_method(DevelopmentSandbox, :enabled?, true) do
      user = User.create!
      conversation = user.conversations.create!(title: "Synthetic")
      assert_raises(DomainError) { Commentary.ask!(conversation: conversation, content: "[sandbox:failure]", context: nil, request_id: "failure_001") }
      assert_equal 0, user.reload.free_consultations
      answer = Commentary.ask!(conversation: conversation, content: "Hello", context: nil, request_id: "success_001")
      assert_includes answer.content, "Development simulation"
      assert_equal true, answer.generation["development_simulation"]
      assert_equal answer.id, Commentary.ask!(conversation: conversation, content: "Hello", context: nil, request_id: "success_001").id
      assert_equal 1, user.reload.free_consultations
      assert_raises(DomainError) { Commentary.ask!(conversation: conversation, content: "Again", context: nil, request_id: "success_002") }
      ProviderConnection.create!(user: user, provider: "chatgpt", credential: "sandbox-key", model: "fixture")
      assert_equal "complete", Commentary.ask!(conversation: conversation, content: "Connected", context: nil, request_id: "success_003").state
      assert_equal 1, user.reload.free_consultations
    end
  end
  test "signed synthetic cities and calendar scenarios retain domain boundaries" do
    with_method(DevelopmentSandbox, :enabled?, true) do
      city = CitySearch.search("Buenos").first
      assert_equal(-34.6, CitySearch.resolve(city[:selection])["latitude"])
      DevelopmentFixtures.calendar!("confirmed")
      result = BiblicalCalendar.call(instant: Time.current.iso8601, latitude: 31.78, longitude: 35.23, timezone: "Asia/Jerusalem")
      assert result["days"][0]["biblical"]["day"]
      assert_equal "unresolved", result["year_start_status"]
      assert NewMoonObservation.find_by!(source_id: "sandbox:synthetic-observation").provenance["development_fixture"]
      DevelopmentFixtures.calendar!("pending")
      assert_not NewMoonObservation.where("source_id LIKE ?", "sandbox:%").exists?
    end
  end
end

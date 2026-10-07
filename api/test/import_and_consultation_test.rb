require "test_helper"
class ImportAndConsultationTest < ActiveSupport::TestCase
  include EnabledProductFeatures
  test "reviewed Qahal export rolls back dry run and replays idempotently" do
    payload = {"schema_version"=>1, "source_revision"=>"fixture-revision", "decrypted"=>true,
      "users"=>[{"telegram_id"=>12345, "display_name"=>"Fixture", "profile"=>{"city"=>"City"}}],
      "assemblies"=>[{"id"=>"fixture", "leader_telegram_id"=>12345, "name"=>"Fixture", "kind"=>"online"}], "memberships"=>[]}
    assert_no_difference ["User.count", "Assembly.count"] do
      assert_equal 1, QahalImport.call(payload)[:users]
    end
    QahalImport.call(payload, dry_run: false)
    assert_no_difference(["User.count", "Assembly.count"]) { QahalImport.call(payload, dry_run: false) }
    user = Identity.find_by!(provider: "telegram", subject: "12345").user
    assert_not user.leader_verified
    assert_nil user.admitted_at
    assert_not user.discoverable
  end
  test "observation import preserves provenance and retracts confirmations" do
    payload = {"schema_version"=>1, "observations"=>[{"id"=>"inms:fixture", "source"=>"israeli_new_moon_society", "source_url"=>"https://moonsocil.blogspot.com/fixture", "observed_on"=>"2026-09-12", "country"=>"IL", "visibility_method"=>"unaided", "verified"=>true, "raw_source_hash"=>"fixture-hash", "observer"=>"Public witness", "location"=>"Israel"}]}
    assert_no_difference("NewMoonObservation.count") { ObservationImport.call(payload) }
    ObservationImport.call(payload, dry_run: false)
    assert_equal "Public witness", NewMoonObservation.last.provenance["observer"]
    assert_no_difference("MonthConfirmation.count") { ObservationImport.call(payload, dry_run: false) }
    payload["observations"][0]["verified"] = false
    assert_difference "MonthConfirmation.count", -1 do
      ObservationImport.call(payload, dry_run: false)
    end
  end
  test "interrupted consultation recovery is idempotent" do
    user = User.create!(display_name: "Fixture", free_consultations: 1)
    conversation = user.conversations.create!(title: "Fixture")
    message = conversation.messages.create!(role: "assistant", content: "Pending", state: "pending", generation: {sponsored: true}, created_at: 11.minutes.ago)
    2.times { RecoverConsultationsJob.perform_now }
    assert_equal "failed", message.reload.state
    assert_equal 0, user.reload.free_consultations
  end
  test "shared AI handles failures and followups without consuming the legacy sponsored quota" do
    old = ENV.to_h.slice("OPENROUTER_API_KEY", "SHARED_OPENROUTER_MODEL")
    ENV["OPENROUTER_API_KEY"] = "test-only-key"
    ENV["SHARED_OPENROUTER_MODEL"] = "openrouter/free"
    user = User.create!(display_name: "Fixture")
    conversation = user.conversations.create!(title: "Fixture")
    broken = Class.new { def self.generate(**); raise IOError, "private upstream body"; end }
    commentary_article
    error = assert_raises(DomainError) { Commentary.ask!(conversation: conversation, content: "Study", context: nil, request_id: "failure_001", generator: broken) }
    assert_equal "provider_response_unavailable", error.message
    assert_equal 0, user.reload.free_consultations
    assert_equal "failed", conversation.messages.find_by!(request_id: "failure_001").state
    success = Class.new { def self.generate(**); '{"answer":"Study this passage cautiously.","source_ids":["fixture:commentary"]}'; end }
    Commentary.ask!(conversation: conversation, content: "Study", context: nil, request_id: "success_001", generator: success)
    assert_equal 0, user.reload.free_consultations
    assert_equal "complete", Commentary.ask!(conversation: conversation, content: "Again", context: nil, request_id: "success_002", generator: success).state
  ensure
    %w[OPENROUTER_API_KEY SHARED_OPENROUTER_MODEL].each { |key| old[key] ? ENV[key] = old[key] : ENV.delete(key) }
  end
end

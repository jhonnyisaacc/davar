ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

# Existing domain tests exercise released features explicitly, without network calls.
# Availability and disabled gates have their own tests with closed defaults.
module EnabledProductFeatures
  extend ActiveSupport::Concern
  included do
    setup do
      @product_flags = FeatureFlags::KEYS.to_h { |key| [key, true] }
      flags = @product_flags
      @original_flag_evaluation = FeatureFlags.method(:evaluate)
      @original_available_providers = CommentaryProvider.method(:available_providers)
      FeatureFlags.define_singleton_method(:evaluate) { |_user = nil| flags.dup }
      CommentaryProvider.define_singleton_method(:available_providers) { %w[claude grok chatgpt gemini] }
    end
    teardown do
      FeatureFlags.define_singleton_method(:evaluate, @original_flag_evaluation)
      CommentaryProvider.define_singleton_method(:available_providers, @original_available_providers)
    end
  end
end

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: 1)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    def commentary_context
      {"schema_version" => 1, "kind" => "verse", "edition_id" => "fixture",
        "reference" => {"system_id" => "davar-v1", "book_id" => "john", "kind" => "verse", "chapter" => 1, "verse" => 51}}
    end

    def commentary_article
      Article.create!(source_id: "fixture:commentary", title: "Study this passage", locale: "en",
        source_url: "https://shaul.vercel.app/fixture", attribution: "Synthetic test note", revision: "fixture",
        input_hash: "fixture", publication_state: "published", permissions: {public_display: true, ai_grounding: true},
        references: [commentary_context["reference"]], body: "This passage is supplied evidence for a study. Its interpretation needs verification.")
    end

    # Add more helper methods to be used by all tests here...
  end
end

ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

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

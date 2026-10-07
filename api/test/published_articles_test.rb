require "test_helper"

class PublishedArticlesTest < ActiveSupport::TestCase
  setup do
    @current = CommentaryCorpus.method(:current)
    @corpus = CommentaryCorpus.new(nil)
    51.times do |index|
      source_id = "shaul:note-#{index.to_s.rjust(3, '0')}"
      @corpus.records[source_id] = {"source_id" => source_id, "kind" => "note", "title" => "Public note #{index}", "locale" => "es",
        "text" => "Original text, including credits.", "attribution" => "Original author", "source_url" => "https://example.test/note/#{index}",
        "revision" => "fixture", "publication" => "published", "permissions" => {"public_display" => true}, "references" => []}
    end
    corpus = @corpus
    CommentaryCorpus.define_singleton_method(:current) { corpus }
  end

  teardown do
    CommentaryCorpus.define_singleton_method(:current, @current)
  end

  test "public archive pages preserve credits, source links and exact source text" do
    page = PublishedArticles.page(locale: "es")
    assert_equal 50, page[:articles].size
    assert_equal 50, page[:next_offset]
    assert_equal 1, PublishedArticles.page(offset: 50)[:articles].size
    assert_nil PublishedArticles.page(offset: 50)[:next_offset]
    row = page[:articles].first
    assert_not row.key?("body")
    article = PublishedArticles.find(row["id"])
    assert_equal "Original text, including credits.", article["body"]
    assert_equal "Original author", article["attribution"]
    assert_equal "https://example.test/note/0", article["source_url"]
    assert_empty PublishedArticles.page(locale: "he")[:articles]
    assert_raises(ActiveRecord::RecordNotFound) { PublishedArticles.find("source_unknown") }
  end

  test "draft or unpermitted corpus records never enter the fallback" do
    @corpus.records.values.first["publication"] = "draft"
    @corpus.records.values.last["permissions"] = {"public_display" => false}
    assert_equal 49, PublishedArticles.page[:articles].size
    assert_nil PublishedArticles.page[:next_offset]
    @corpus.records.values[1]["kind"] = "knowledge"
    assert_equal 48, PublishedArticles.page[:articles].size
  end

  test "explicit published imports retain their IDs and override duplicate archive metadata" do
    article = commentary_article
    @corpus.records[article.source_id] = @corpus.records.values.first.merge("source_id" => article.source_id)
    rows = PublishedArticles.page[:articles]
    assert_equal 1, rows.count { |row| row["source_id"] == article.source_id }
    row = rows.find { |item| item["source_id"] == article.source_id }
    assert_equal article.id, row["id"]
    assert_equal article.body, PublishedArticles.find(article.id)["body"]
  end

  test "reading omits only the metadata preamble and never rewrites source content" do
    record = @corpus.records.values.first
    record["text"] = "---\nauthor: Shaul\n---\n# Original prose\nOriginal credits."
    start = record["text"].index("# Original prose")
    record["sections"] = [{"heading" => "Metadata", "start_byte" => 0}, {"heading" => "Original prose", "start_byte" => start}]
    assert_equal "# Original prose\nOriginal credits.", PublishedArticles.find(PublishedArticles.source_id(record))["body"]
    assert record["text"].start_with?("---")
  end
end

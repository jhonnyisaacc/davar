require "test_helper"
require "tmpdir"

class CommentaryCorpusTest < ActiveSupport::TestCase
  include EnabledProductFeatures
  def note(id, title, alias_name, text = nil)
    text ||= "# Tesis\nOriginal contextual interpretation.\n## Detail\n#{title}: original passage.\n## Pendiente de verificar\nNeeds verification; not a fixed lexical definition.\n## Créditos\nOriginal author.\n"
    boundaries = text.to_enum(:scan, /^#+ (.+)$/).map { Regexp.last_match.begin(0) }
    sections = boundaries.each_with_index.map do |start, i|
      finish = boundaries[i + 1] || text.length
      original = text[start...finish]
      heading = original.lines.first.delete_prefix("# ").delete_prefix("## ").strip
      {"heading" => heading, "start_byte" => text[0...start].bytesize, "end_byte" => text[0...finish].bytesize,
        "context" => heading != "Detail", "sha256" => Digest::SHA256.hexdigest(original), "terms" => CommentaryCorpus.normalize(original).split.to_h { |t| [t, 1] }}
    end
    {"source_id" => "shaul:#{id}", "upstream_id" => id, "kind" => "note", "record_type" => "note", "path" => "content/#{id}.md", "title" => title,
      "text" => text, "sha256" => Digest::SHA256.hexdigest(text), "revision" => CommentaryCorpus::REVISION, "attribution" => "Original author",
      "source_url" => "https://github.com/jhonnyisaacc/shaul/blob/#{CommentaryCorpus::REVISION}/content/#{id}.md", "review" => "unreviewed",
      "permissions" => {"public_display" => true, "ai_grounding" => true}, "publication" => "published", "metadata" => {"references" => id == "man" ? ["#juan_1_51"] : []},
      "aliases" => [alias_name, CommentaryCorpus.normalize(title)], "references" => [], "sections" => sections, "metadata_terms" => CommentaryCorpus.normalize(title).split.to_h { |t| [t, 1] }}
  end

  def with_corpus(records = [note("man", "Hijo del Hombre", "son of man"), note("faith", "Fe", "faith")])
    Dir.mktmpdir do |dir|
      payload = {schema_version: 1, source_revision: CommentaryCorpus::REVISION, records: records,
        indexes: {aliases: records.flat_map { |r| r["aliases"].map { |a| [a, [r["source_id"]]] } }.to_h, topics: {}, references: {"juan_1_51" => [records.first["source_id"]]}}, book_aliases: {"juan" => "john", "john" => "john"}}
      path = File.join(dir, "corpus.json")
      File.write(path, JSON.generate(payload))
      File.write(File.join(dir, "report.json"), JSON.generate(corpus_sha256: Digest::SHA256.file(path).hexdigest, source_preservation_verified: true))
      yield CommentaryCorpus.new(path), path
    end
  end

  test "topics native references books chapters selected words and followups use complete current sections" do
    with_corpus do |corpus, _|
      search = ->(q, **options) { CommentarySearch.call(question: q, context: options[:context], previous_ids: options.fetch(:previous_ids, []), corpus: corpus) }
      %w[john].each { |q| assert_equal "shaul:man", search.call(q).first[:source_id] }
      ["Son of Man", "Juan 1", "Juan 1:51", "#juan_1_51"].each do |q|
        result = search.call(q)
        assert_equal "shaul:man", result.first[:source_id]
        assert_includes result.first[:sections].map { |s| s[:heading] }, "Pendiente de verificar"
        assert_includes result.first[:sections].map { |s| s[:heading] }, "Créditos"
        assert_operator JSON.generate(result).bytesize, :<=, 32768
      end
      assert_equal "shaul:man", search.call("Explain more", previous_ids: ["shaul:man", "removed"]).first[:source_id]
      assert_equal ["shaul:faith"], search.call("What is faith?", previous_ids: ["shaul:man"]).map { |e| e[:source_id] }
      context = commentary_context.merge("kind" => "word", "token_index" => 0, "selected_text" => "Fe")
      assert_equal "shaul:faith", search.call("Explain this word", context: context).first[:source_id]
      assert_empty search.call("quuxflarb")
    end
  end

  test "necessary cautions exceeding the budget omit the whole source" do
    long = note("large", "Large", "large", "# Tesis\nOriginal\n## Detail\nUseful detail\n## Pendiente de verificar\n#{'Caution ' * 6000}\n## Créditos\nAuthor\n")
    with_corpus([long]) do |corpus, _|
      assert_empty CommentarySearch.call(question: "large", context: nil, corpus: corpus)
    end
  end

  test "duplicate concept and word aliases do not change the preferred explanatory note" do
    first = note("faith", "Faith", "faith")
    second = note("man", "Faith", "faith")
    concept = note("concept", "Emunah", "faith").merge("kind" => "knowledge", "record_type" => "concept", "aliases" => %w[faith fe])
    word = note("word", "Emunah", "fe").merge("kind" => "knowledge", "record_type" => "word")
    with_corpus([first, second, concept, word]) do |corpus, _|
      corpus.indexes["aliases"] = {"faith" => [concept["source_id"]], "fe" => [concept["source_id"], word["source_id"]]}
      corpus.indexes["topics"] = {"concept" => [first["source_id"], second["source_id"]], "word" => [second["source_id"]]}
      ["What is faith?", "Que es la fe"].each do |question|
        result = CommentarySearch.call(question: question, context: nil, corpus: corpus)
        assert_equal first["source_id"], result.first[:source_id]
      end
    end
  end

  test "corpus corruption is rejected before evidence can be used" do
    with_corpus do |_, path|
      File.write(path, File.read(path).sub("Original author", "Changed author"))
      assert_raises(ArgumentError) { CommentaryCorpus.new(path) }
    end
  end

  test "structured answers reject empty missing or unknown citations" do
    evidence = [{source_id: "shaul:man"}]
    assert_equal ["Original interpretation", ["shaul:man"]], Commentary.parse_answer!('{"answer":"Original interpretation","source_ids":["shaul:man"]}', evidence)
    ["Plain text", '{"answer":"Answer","source_ids":[]}', '{"answer":"Answer","source_ids":["invented"]}', '{"answer":"","source_ids":["shaul:man"]}'].each do |raw|
      assert_equal "invalid_grounded_response", assert_raises(DomainError) { Commentary.parse_answer!(raw, evidence) }.code
    end
  end

  test "answer blocks render consistently and reject extra bullets" do
    answer = {positive_label: "Qué es", positive: ["Una lectura de la nota."], negative_label: "Qué no es", negative: ["No es una definición fija."], caution: "Necesita comprobarse."}
    payload = {answer: answer, source_ids: ["shaul:man"]}
    text, ids = Commentary.parse_answer!(JSON.generate(payload), [{source_id: "shaul:man"}])
    assert_equal "Qué es\n- Una lectura de la nota.\n\nQué no es\n- No es una definición fija.\n\nNecesita comprobarse.", text
    assert_equal ["shaul:man"], ids
    answer[:positive] = ["One", "Two", "Three"]
    assert_raises(DomainError) { Commentary.parse_answer!(JSON.generate(payload), [{source_id: "shaul:man"}]) }
    answer[:positive] = ["One\nHidden second line"]
    assert_raises(DomainError) { Commentary.parse_answer!(JSON.generate(payload), [{source_id: "shaul:man"}]) }
  end

  test "missing coverage skips shared generation and quota and deduplicates retries" do
    old = ENV.to_h.slice("OPENROUTER_API_KEY", "SHARED_OPENROUTER_MODEL")
    ENV["OPENROUTER_API_KEY"], ENV["SHARED_OPENROUTER_MODEL"] = "fixture", "openrouter/free"
    user = User.create!
    conversation = user.conversations.create!(title: "Coverage")
    generator = Class.new { def self.generate(**); raise "Must not call provider"; end }
    answer = Commentary.ask!(conversation: conversation, content: "quuxflarb", context: nil, request_id: "coverage_001", generator: generator)
    assert_equal "missing", answer.generation["evidence_status"]
    assert_empty answer.citations
    assert_equal 0, user.reload.free_consultations
    assert_equal answer.id, Commentary.ask!(conversation: conversation, content: "quuxflarb", context: nil, request_id: "coverage_001", generator: generator).id
  ensure
    %w[OPENROUTER_API_KEY SHARED_OPENROUTER_MODEL].each { |key| old[key] ? ENV[key] = old[key] : ENV.delete(key) }
  end

  test "unpublished or unpermitted articles are not grounding evidence" do
    article = commentary_article
    article.update!(permissions: {public_display: true, ai_grounding: false})
    assert_empty CommentarySearch.call(question: "Study", context: commentary_context, corpus: CommentaryCorpus.new(nil))
    article.update!(permissions: {public_display: true, ai_grounding: true}, publication_state: "draft")
    assert_empty CommentarySearch.call(question: "Study", context: commentary_context, corpus: CommentaryCorpus.new(nil))
  end

  test "invalid citations fail the shared consultation without consuming the legacy quota" do
    old = ENV.to_h.slice("OPENROUTER_API_KEY", "SHARED_OPENROUTER_MODEL")
    ENV["OPENROUTER_API_KEY"], ENV["SHARED_OPENROUTER_MODEL"] = "fixture", "openrouter/free"
    commentary_article
    user = User.create!
    conversation = user.conversations.create!(title: "Invalid citation")
    generator = Class.new { def self.generate(**); '{"answer":"Unsupported","source_ids":["invented"]}'; end }
    error = assert_raises(DomainError) { Commentary.ask!(conversation: conversation, content: "Study", context: commentary_context, request_id: "invalid_001", generator: generator) }
    assert_equal "invalid_grounded_response", error.code
    assert_equal "failed", conversation.messages.find_by!(request_id: "invalid_001").state
    assert_equal 0, user.reload.free_consultations
  ensure
    %w[OPENROUTER_API_KEY SHARED_OPENROUTER_MODEL].each { |key| old[key] ? ENV[key] = old[key] : ENV.delete(key) }
  end
end

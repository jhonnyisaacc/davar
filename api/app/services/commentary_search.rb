# A small deterministic search over source-owned names, links, references and text.
class CommentarySearch
  STOP_WORDS = %w[what who is are the a an of in on to about explain meaning does do and this that more can you me it que qué es el la los las un una de del en al por para como cómo cual cuál y esto esa ese sobre significa significado explicame explicarme mas más].freeze
  FOLLOWUP = /\A(?:and\b|why\b|how so\b|explain (?:more|that)\b|tell me more\b|what does (?:that|it)\b|y\b|por que\b|explica(?:me)? (?:mas|eso)\b|que significa (?:eso|esto)\b|continua\b)/

  def self.call(question:, context:, previous_ids: [], corpus: CommentaryCorpus.current)
    new(corpus).call(question, context, previous_ids)
  end

  def initialize(corpus)
    @corpus = corpus
  end

  def terms(text)
    CommentaryCorpus.normalize(text).split.reject { |term| STOP_WORDS.include?(term) }.uniq
  end

  def call(question, context, previous_ids)
    query = CommentaryCorpus.normalize(question)
    @definition_query = query.match?(/what is|meaning|que es|significa/)
    keywords = terms(question)
    @phrases = []
    scores = Hash.new(0)
    routing_query = query
    if context&.dig("kind") == "word" && (keywords - %w[word verse passage palabra versiculo texto]).empty?
      routing_query = [query, CommentaryCorpus.normalize(context["selected_text"])].join(" ")
    end
    # Longest matching alias prevents "Son of God" routing to a generic "Son".
    matches = @corpus.indexes.fetch("aliases", {}).keys.select { |a| !a.empty? && " #{routing_query} ".include?(" #{a} ") }
    matches = matches.reject { |a| matches.any? { |longer| longer != a && " #{longer} ".include?(" #{a} ") } }
    linked_ids = []
    matches.each do |alias_name|
      @corpus.indexes["aliases"][alias_name].each do |sid|
        scores[sid] += 500
        record = @corpus.records[sid]
        @phrases |= record["aliases"]
        keywords |= record["aliases"].flat_map { |a| terms(a) }
        linked_ids |= @corpus.indexes.fetch("topics", {}).fetch(record["upstream_id"], [])
      end
    end
    linked_ids.each { |sid| scores[sid] += 350 }
    explicit_reference = reference_scores(question, scores)
    followup = matches.empty? && !explicit_reference && query.split.size <= 18 && FOLLOWUP.match?(query)
    if followup
      previous_ids.each { |sid| scores[sid] += 600 if @corpus.records.key?(sid) }
    end
    # A selected verse is a navigation context, not a forced topic for a new question.
    if matches.empty? && !explicit_reference && context
      ref = context["reference"]
      @corpus.records.each_value do |record|
        record["references"].each do |reference|
          scores[record["source_id"]] += 450 if reference["status"] == "mapped" && reference["reference"] == ref
        end
      end
      keywords |= terms(context["selected_text"]) if context["kind"] == "word"
    end
    frequencies = keywords.to_h { |term| [term, @corpus.records.values.count { |r| r["metadata_terms"].key?(term) || r["sections"].any? { |s| s["terms"].key?(term) } }] }
    @corpus.records.each_value do |record|
      hits = keywords.select { |term| record["metadata_terms"].key?(term) || record["sections"].any? { |s| s["terms"].key?(term) } }
      next if hits.empty? || (matches.empty? && keywords.size > 1 && hits.size < [keywords.size, 2].min)
      headings = record["sections"].map { |s| " #{CommentaryCorpus.normalize(s["heading"])} " }
      title = " #{CommentaryCorpus.normalize(record["title"])} "
      if @phrases.any? { |p| title.include?(" #{p} ") }
        scores[record["source_id"]] += 500
      elsif @phrases.any? { |p| headings.any? { |h| h.include?(" #{p} ") } }
        scores[record["source_id"]] += 150
      end
      hits.each do |term|
        weight = Math.log(1.0 + @corpus.records.size / (1.0 + frequencies[term]))
        scores[record["source_id"]] += weight * (record["metadata_terms"].key?(term) ? 10 : 1)
      end
    end
    candidates = scores.sort_by { |sid, score| [-score, sid] }.filter_map do |sid, score|
      record = @corpus.records[sid]
      next unless record && score > 0
      [record, keywords, score]
    end
    articles = Article.published.where("permissions @> ?", {public_display: true, ai_grounding: true}.to_json).to_a.filter_map do |article|
      exact = matches.empty? && context && article.references.include?(context["reference"])
      hits = keywords & terms([article.title, article.body].join(" "))
      next unless exact || (!keywords.empty? && hits.size >= [keywords.size, 2].min)
      text = article.body.to_s
      record = {"source_id" => article.source_id, "article_id" => article.id, "title" => article.title,
        "revision" => article.revision, "attribution" => article.attribution, "source_url" => article.source_url,
        "text" => text, "sha256" => Digest::SHA256.hexdigest(text), "sections" => [{"heading" => article.title, "start_byte" => 0, "end_byte" => text.bytesize, "context" => true, "terms" => {}}]}
      [record, keywords, exact ? 1000 : 50]
    end
    pack((candidates + articles).sort_by { |record, _, score| [-score, record["source_id"]] })
  end

  def reference_scores(question, scores)
    found = false
    # Exact native tags stay native: unresolved numbering is never promoted to davar-v1.
    question.downcase.scan(/#?([\p{L}\d]+)_([0-9]+)(?:_([0-9]+)(?:-([0-9]+))?)?/) do |book, chapter, verse, _|
      key = [book, chapter, verse].compact.join("_")
      @corpus.indexes.fetch("references", {}).fetch(key, []).each { |sid| scores[sid] += 800 }
      found = true
    end
    @corpus.book_aliases.each do |alias_name, book_id|
      pattern = /(?:\A|[^\p{L}\p{N}])#{Regexp.escape(alias_name)}(?:\s+(\d+)(?:\s*[:._]\s*(\d+))?)?(?=\z|[^\p{L}\p{N}])/i
      question.scan(pattern) do |chapter, verse|
        found = true
        @corpus.records.each_value do |record|
          hit = Array(record["metadata"].fetch("references", [])).any? do |raw|
            parts = raw.to_s.match(/\A#?([\p{L}\d]+)_(\d+)(?:_(\d+)(?:-(\d+))?)?\z/)
            next false unless parts && @corpus.book_aliases[CommentaryCorpus.normalize(parts[1])] == book_id
            (!chapter || parts[2] == chapter) && (!verse || (parts[3] && verse.to_i.between?(parts[3].to_i, (parts[4] || parts[3]).to_i)))
          end
          scores[record["source_id"]] += (verse ? 800 : chapter ? 650 : 400) if hit
        end
      end
    end
    found
  end

  def pack(candidates)
    budget = Integer(ENV.fetch("COMMENTARY_EVIDENCE_BYTES", "32768"))
    raise DomainError.new("invalid_evidence_budget", 503) unless budget.between?(1024, 131072)
    evidence = []
    # Prefer an explanatory concept and its notes over filling the budget with labels.
    candidates = candidates.sort_by do |record, _, score|
      explanatory = score >= 350 && record["record_type"] == "concept" && record["metadata"].keys.intersect?(%w[summary description])
      [explanatory ? 0 : record["kind"] == "note" || record["article_id"] ? 1 : 2, -score, record["source_id"]]
    end.uniq { |record, _, _score| record["source_id"] }
    candidates.each do |record, keywords, score|
      break if evidence.size >= 3
      next if evidence.any? { |e| e[:sections].any? { |s| s[:heading] != "Introduction" } } && record["kind"] == "knowledge" && score < 350
      available = 6 - evidence.sum { |e| e[:sections].size }
      sections = record["sections"].reject { |s| s["metadata"] || record["text"].byteslice(s["start_byte"]...s["end_byte"]).strip.empty? }
      mandatory = sections.select { |s| s["context"] }
      relevant = (sections - mandatory).presence || sections
      relevant = relevant.max_by do |s|
        heading = terms(s["heading"])
        normalized_heading = " #{CommentaryCorpus.normalize(s["heading"])} "
        definition = @definition_query && normalized_heading.match?(/lexic|glosario|que significa/) && keywords.any? { |word| s["terms"].key?(word) }
        keywords.sum { |word| (heading.include?(word) ? 20 : 0) + (s["terms"].key?(word) ? 1 : 0) } + @phrases.count { |phrase| normalized_heading.include?(" #{phrase} ") } * 100 + (definition ? 75 : 0)
      end
      selected = (mandatory + [relevant].compact).uniq.sort_by { |s| s["start_byte"] }
      next if selected.empty? || selected.size > available
      passage = {source_id: record["source_id"], title: record["title"], revision: record["revision"], sha256: record["sha256"],
        attribution: record["attribution"], source_url: record["source_url"], review: record["review"] || "unreviewed", metadata: record["metadata"],
        sections: selected.map { |s| {heading: s["heading"], start_line: s["start_line"], end_line: s["end_line"],
          text: record["text"].byteslice(s["start_byte"]...s["end_byte"])} }}
      next if JSON.generate(evidence + [passage]).bytesize > budget
      citation = {source_id: record["source_id"], source_url: record["source_url"], revision: record["revision"], attribution: record["attribution"], title: record["title"], section_labels: selected.map { |s| s["heading"] }}
      citation[:article_id] = record["article_id"] if record["article_id"]
      passage[:citation] = citation
      # Count the entire serialized evidence, including its display metadata.
      next if JSON.generate(evidence + [passage]).bytesize > budget
      evidence << passage
    end
    evidence
  end
end

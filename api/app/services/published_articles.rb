class PublishedArticles
  LIST_FIELDS = %w[id source_id title locale source_url attribution references revision].freeze
  PAGE_SIZE = 50

  def self.page(locale: nil, offset: 0)
    rows = Article.published.order(:source_id).as_json(only: LIST_FIELDS)
    imported_ids = rows.map { |row| row["source_id"] }
    rows += corpus_records.reject { |record| imported_ids.include?(record["source_id"]) }.map { |record| serialize(record) }
    rows.select! { |row| row["locale"] == locale } if locale.present?
    rows.sort_by! { |row| row["source_id"] }
    start = [offset.to_i, 0].max
    {articles: rows.slice(start, PAGE_SIZE) || [], next_offset: start + PAGE_SIZE < rows.size ? start + PAGE_SIZE : nil}
  end

  def self.find(id)
    if id.to_s.start_with?("source_")
      record = corpus_records.find { |item| source_id(item) == id }
      raise ActiveRecord::RecordNotFound unless record
      # Hide the source's YAML preamble in the reader while preserving prose and credits.
      start = Array(record["sections"]).find { |section| section["heading"] != "Metadata" }&.fetch("start_byte", 0) || 0
      serialize(record).merge("body" => record["text"].byteslice(start..), "permissions" => record["permissions"])
    else
      Article.published.find(id).as_json(only: LIST_FIELDS + %w[body permissions])
    end
  end

  def self.corpus_records
    # CommentaryCorpus checks publication, permissions, excluded paths and source hashes.
    CommentaryCorpus.current.records.values.select { |r| r["kind"] == "note" && r["publication"] == "published" && r.dig("permissions", "public_display") == true }
  rescue DomainError
    []
  end

  def self.source_id(record)
    "source_#{Digest::SHA256.hexdigest(record.fetch('source_id'))}"
  end

  def self.serialize(record)
    {"id" => source_id(record), "source_id" => record["source_id"], "title" => record["title"],
      "locale" => record.fetch("locale", "es"), "source_url" => record["source_url"],
      "attribution" => record["attribution"], "revision" => record["revision"],
      "references" => Array(record["references"]).filter_map { |ref| ref["reference"] if ref["status"] == "mapped" }}
  end
end

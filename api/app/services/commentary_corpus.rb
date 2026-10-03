require "digest"
require "json"
require "thread"

# Generated indexes locate original public passages; they are not editorial content.
class CommentaryCorpus
  REVISION = "8c94b0fe9eca817e22340430309801d0ef76125b"
  LOCK = Mutex.new

  def self.current
    configured = ENV["COMMENTARY_CORPUS_PATH"].presence
    path = configured || Rails.root.join("../data/commentary/generated/corpus.json").to_s
    return new(nil) if !configured && (Rails.env.test? || !File.exist?(path))
    stamp = [path, File.stat(path).mtime, File.size(path), File.stat(File.join(File.dirname(path), "report.json")).mtime]
    LOCK.synchronize do
      @cached = [stamp, new(path)] if @cached.nil? || @cached.first != stamp
      @cached.last
    end
  rescue SystemCallError, JSON::ParserError, KeyError, ArgumentError => error
    Rails.logger.error("Commentary corpus unavailable: #{error.class.name}")
    raise DomainError.new("commentary_corpus_unavailable", 503)
  end

  def self.normalize(text)
    text.to_s.unicode_normalize(:nfkd).downcase.gsub(/\p{M}/, "").scan(/[\p{L}\p{N}]+/).join(" ")
  end

  attr_reader :records, :indexes, :book_aliases, :revision

  def initialize(path)
    @records, @indexes, @book_aliases = {}, {}, {}
    return unless path
    bytes = File.binread(path)
    report = JSON.parse(File.read(File.join(File.dirname(path), "report.json")))
    raise ArgumentError, "Corpus hash mismatch" unless report.fetch("corpus_sha256") == Digest::SHA256.hexdigest(bytes)
    data = JSON.parse(bytes)
    @revision = data.fetch("source_revision")
    raise ArgumentError, "Unexpected corpus" unless data.fetch("schema_version") == 1 && revision == REVISION && report["source_preservation_verified"] == true
    data.fetch("records").each do |record|
      text = record.fetch("text")
      sid = record.fetch("source_id")
      path = record.fetch("path")
      metadata = record.fetch("metadata")
      public_path = path.match?(%r{\A(?:content|knowledge)/}) && (path.split("/") & %w[private templates .obsidian ..]).empty?
      expected_url = "https://github.com/jhonnyisaacc/shaul/blob/#{revision}/#{path}"
      raise ArgumentError, "Excluded source" unless public_path && record["source_url"] == expected_url && metadata["draft"] != true && metadata["draft"] != "true" && metadata["publish"] != false
      raise ArgumentError, "Invalid source" unless record["revision"] == revision && record["permissions"] == {"public_display" => true, "ai_grounding" => true} && record["publication"] == "published" && !records.key?(sid)
      raise ArgumentError, "Source hash mismatch" unless Digest::SHA256.hexdigest(text) == record.fetch("sha256")
      position = 0
      record.fetch("sections").each do |section|
        raise ArgumentError, "Noncontiguous section" unless section.fetch("start_byte") == position
        position = section.fetch("end_byte")
        original = text.byteslice(section["start_byte"]...position)
        raise ArgumentError, "Section hash mismatch" unless original && Digest::SHA256.hexdigest(original) == section.fetch("sha256")
      end
      raise ArgumentError, "Incomplete source" unless position == text.bytesize
      records[sid] = record
    end
    @indexes = data.fetch("indexes")
    @book_aliases = data.fetch("book_aliases")
    raise ArgumentError, "Unknown indexed source" unless indexes.values.all? { |index| index.values.flatten.all? { |sid| records.key?(sid) } }
  end
end

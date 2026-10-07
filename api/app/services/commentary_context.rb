class CommentaryContext
  BOOK_IDS = JSON.parse(File.read(Rails.root.join("../data/knowledge/registries/books.json"))).map { |book| book.fetch("id") }.freeze
  def self.validate!(context)
    return nil if context.nil?
    raise DomainError.new("invalid_context") unless context.is_a?(Hash) && context["schema_version"] == 1 && context["kind"].in?(%w[word verse])
    ref = context["reference"]
    valid = ref.is_a?(Hash) && ref["system_id"] == "davar-v1" && ref["kind"] == "verse" &&
      BOOK_IDS.include?(ref["book_id"]) &&
      %w[chapter verse].all? { |key| ref[key].is_a?(Integer) && ref[key] > 0 }
    raise DomainError.new("invalid_reference") unless valid
    raise DomainError.new("edition_required") unless context["edition_id"].is_a?(String) && context["edition_id"].length.between?(1, 100)
    if context["kind"] == "word"
      raise DomainError.new("invalid_word_reference") unless context["token_index"].is_a?(Integer) && context["token_index"] >= 0
    end
    allowed = %w[schema_version kind reference edition_id token_index token_id selected_text]
    raise DomainError.new("invalid_context") unless (context.keys - allowed).empty?
    raise DomainError.new("context_too_large") if context.to_json.bytesize > 4000
    context
  end
end

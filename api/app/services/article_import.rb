class ArticleImport
  def self.call(payload, dry_run: true)
    raise DomainError.new("unsupported_import") unless payload["schema_version"] == 1 && payload["source_revision"].present?
    report = {dry_run: dry_run, revision: payload["source_revision"], articles: 0}
    Article.transaction do
      payload.fetch("articles").each do |row|
        raise DomainError.new("private_source_forbidden") unless row["source_url"].to_s.start_with?("https://shaul.vercel.app/") && !row["source_id"].to_s.include?("private")
        row.fetch("references").each { |ref| CommentaryContext.validate!({"schema_version"=>1, "kind"=>"verse", "edition_id"=>"reference-only", "reference"=>ref}) }
        article = Article.find_or_initialize_by(source_id: row.fetch("source_id"))
        attributes = row.slice("title", "locale", "body", "source_url", "attribution", "publication_state", "references", "permissions")
        article.assign_attributes(attributes.merge(revision: payload["source_revision"], input_hash: Digest::SHA256.hexdigest(JSON.generate(row))))
        article.save!
        report[:articles] += 1
      end
      raise ActiveRecord::Rollback if dry_run
    end
    report
  end
end

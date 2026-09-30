class RateLimit < ApplicationRecord
  def self.check!(bucket, limit:)
    key = "#{bucket}/#{Time.current.to_i / 60}"
    ApplicationRecord.transaction do
      digest = Digest::SHA256.hexdigest(key)[0, 15].to_i(16)
      connection.execute("SELECT pg_advisory_xact_lock(#{digest})")
      row = find_or_create_by!(bucket: key) { |item| item.expires_at = 2.minutes.from_now }
      raise DomainError.new("rate_limited", 429) if row.attempts >= limit
      row.increment!(:attempts)
      where("expires_at < ?", Time.current).delete_all
    end
  end
end

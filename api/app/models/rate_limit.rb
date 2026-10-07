class RateLimit < ApplicationRecord
  def self.available?(bucket, limit:, period: 60)
    row = find_by(bucket: "#{bucket}/#{Time.current.to_i / period}")
    !row || row.attempts < limit
  end

  def self.check!(bucket, limit:, period: 60)
    key = "#{bucket}/#{Time.current.to_i / period}"
    ApplicationRecord.transaction do
      digest = Digest::SHA256.hexdigest(key)[0, 15].to_i(16)
      connection.execute("SELECT pg_advisory_xact_lock(#{digest})")
      row = find_or_create_by!(bucket: key) { |item| item.expires_at = Time.at((Time.current.to_i / period + 1) * period) + 1.minute }
      raise DomainError.new("rate_limited", 429) if row.attempts >= limit
      row.increment!(:attempts)
      where("expires_at < ?", Time.current).delete_all
    end
  end
end

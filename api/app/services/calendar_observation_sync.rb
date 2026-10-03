require "net/http"
require "open3"

class CalendarObservationSync
  FEED_URL = "https://moonsocil.blogspot.com/feeds/posts/default?alt=rss&max-results=50"
  MAX_FEED_BYTES = 8 * 1024 * 1024

  def self.call(rss_xml: nil, now: Time.current, fetcher: method(:fetch_feed))
    state = CalendarFeedState.current
    report = nil
    state.with_lock do
      begin
        xml = rss_xml || fetcher.call
        raise DomainError.new("calendar_feed_too_large", 503) if xml.bytesize > MAX_FEED_BYTES
        known = CalendarSourceEntry.where(source: CalendarFeedState::SOURCE).pluck(:source_entry_id, :content_hash).to_h
        entries = parse_feed(xml, known, now)
        changed = entries.reject { |entry| entry["unchanged"] }
        accepted = changed.select { |entry| entry["parse_status"] == "ok" }
        report = ObservationImport.call({"schema_version" => 1,
          "observations" => accepted.flat_map { |entry| entry.fetch("observations") },
          "replace_entry_ids" => accepted.map { |entry| entry.fetch("source_entry_id") }}, dry_run: false)
        entries.each do |entry|
          record = CalendarSourceEntry.find_or_initialize_by(source: CalendarFeedState::SOURCE, source_entry_id: entry.fetch("source_entry_id"))
          if entry["unchanged"]
            record.update!(last_seen_at: now)
          else
            record.update!(entry.slice("source_url", "title", "content_hash", "raw_content", "parse_status", "reason")
              .merge(last_seen_at: now, last_parsed_at: now))
          end
        end
        reviews = CalendarSourceEntry.where(source: CalendarFeedState::SOURCE, parse_status: "requires_review").count
        report.merge!(fetched: entries.length, changed: changed.length, review_count: reviews)
        state.update!(status: reviews.positive? ? "requires_review" : "ok", last_attempt_at: now, last_success_at: now, details: report)
      rescue DomainError => error
        state.update!(status: "source_unavailable", last_attempt_at: now, details: state.details.merge("error" => error.code))
        report = {status: "source_unavailable", error: error.code}
      end
    end
    report.merge(status: state.status)
  end

  def self.parse_feed(xml, known, now)
    output, _, status = Open3.capture3(ENV.fetch("PYTHON_BIN", "python3"), Rails.root.join("lib/bore/feed_bridge.py").to_s,
      stdin_data: JSON.generate(rss_xml: xml, fetched_at: now.iso8601, known_hashes: known))
    raise DomainError.new("calendar_feed_malformed", 503) unless status.success?
    JSON.parse(output).fetch("entries")
  rescue Errno::ENOENT
    raise DomainError.new("calendar_parser_unavailable", 503)
  rescue JSON::ParserError, KeyError
    raise DomainError.new("calendar_feed_malformed", 503)
  end

  def self.fetch_feed
    uri = URI(FEED_URL)
    request = Net::HTTP::Get.new(uri)
    request["User-Agent"] = "DavarCalendar/1.0 (+https://github.com/jhonnyisaacc/davar)"
    data = +""
    Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 20) do |http|
      http.request(request) do |response|
        raise DomainError.new("calendar_feed_unavailable", 503) unless response.is_a?(Net::HTTPSuccess)
        response.read_body do |chunk|
          data << chunk
          raise DomainError.new("calendar_feed_too_large", 503) if data.bytesize > MAX_FEED_BYTES
        end
      end
    end
    data.force_encoding(Encoding::UTF_8)
  rescue Timeout::Error, SocketError, IOError, SystemCallError, OpenSSL::SSL::SSLError
    raise DomainError.new("calendar_feed_unavailable", 503)
  end
end

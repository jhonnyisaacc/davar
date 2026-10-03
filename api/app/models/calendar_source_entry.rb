class CalendarSourceEntry < ApplicationRecord
  validates :source, :source_entry_id, :source_url, :content_hash, :parse_status, presence: true
end

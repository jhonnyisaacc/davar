class Article < ApplicationRecord
  scope :published, -> { where(publication_state: "published") }
  validates :source_id, :title, :locale, :source_url, :attribution, :revision, :input_hash, presence: true
  validate do
    errors.add(:permissions, "public display permission required") if publication_state == "published" && permissions["public_display"] != true
  end
end

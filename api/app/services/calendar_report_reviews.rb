require "yaml"

class CalendarReportReviews
  def self.all
    YAML.safe_load_file(Rails.root.join("config/calendar_report_reviews.yml"))
  end
end

require "yaml"

class CalendarMonthAnchors
  def self.all
    YAML.safe_load_file(Rails.root.join("config/calendar_month_anchors.yml"))
  end
end

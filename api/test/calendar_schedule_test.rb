require "test_helper"
require "yaml"

class CalendarScheduleTest < ActiveSupport::TestCase
  test "calendar task persists once per scheduled run and recurs every thirty minutes" do
    settings = YAML.safe_load_file(Rails.root.join("config/recurring.yml"), aliases: true)
    %w[development staging production].each do |environment|
      assert_equal "SyncCalendarObservationsJob", settings.dig(environment, "sync_calendar_observations", "class")
    end
    config = settings.fetch("development").fetch("sync_calendar_observations").symbolize_keys
    task = SolidQueue::RecurringTask.from_configuration("sync_calendar_observations", **config)
    task.save!
    at = Time.iso8601("2026-10-03T15:00:00Z")
    assert_equal at + 30.minutes, task.next_time_after(at).to_time

    original = SyncCalendarObservationsJob.queue_adapter
    SyncCalendarObservationsJob.queue_adapter = :solid_queue
    assert_difference ["SolidQueue::Job.count", "SolidQueue::RecurringExecution.count"], 1 do
      task.enqueue(at: at)
      task.enqueue(at: at)
    end
    assert_equal "calendar", SolidQueue::Job.sole.queue_name
    assert_equal "SyncCalendarObservationsJob", SolidQueue::Job.sole.class_name
    assert_difference "SolidQueue::Job.count", 1 do
      task.enqueue(at: at + 30.minutes)
    end
  ensure
    SyncCalendarObservationsJob.queue_adapter = original if original
  end
end

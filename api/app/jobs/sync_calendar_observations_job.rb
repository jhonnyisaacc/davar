class SyncCalendarObservationsJob < ApplicationJob
  def perform
    CalendarObservationSync.call
  end
end

class SyncCalendarObservationsJob < ApplicationJob
  queue_as :calendar

  def perform(force = false)
    CalendarObservationSync.call(if_due: !force)
  end
end

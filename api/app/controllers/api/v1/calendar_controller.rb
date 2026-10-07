module Api
  module V1
    class CalendarController < BaseController
      skip_before_action :authenticate!
      def locations
        throttle!("calendar_city/#{request.remote_ip}", limit: 10)
        render json: {cities: CitySearch.search(params[:q]).map { |city| city.except(:selection) }}
      end
      def today
        render json: result(1)
      end
      def upcoming
        render json: result(Integer(params.fetch(:days, 14)))
      rescue ArgumentError
        raise DomainError.new("invalid_calendar_range")
      end
      private
      def result(count)
        throttle!("calendar/#{request.remote_ip}", limit: 30)
        BiblicalCalendar.call(instant: params.fetch(:instant, Time.current.iso8601), latitude: params[:latitude], longitude: params[:longitude], timezone: params[:timezone], count: count, refresh_source: true)
      end
    end
  end
end

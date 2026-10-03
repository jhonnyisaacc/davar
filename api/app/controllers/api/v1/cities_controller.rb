module Api
  module V1
    class CitiesController < BaseController
      before_action :assemblies_access!
      def index
        throttle!("city/#{current_user.id}", limit: 10)
        render json: {cities: CitySearch.search(params[:q])}
      end
      def update
        city = CitySearch.resolve(params.require(:selection))
        current_user.with_lock do
          current_user.update!(profile: (current_user.profile || {}).merge(city.stringify_keys))
        end
        render json: {city: city[:city]}
      end
    end
  end
end

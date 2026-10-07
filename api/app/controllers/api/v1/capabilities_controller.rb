module Api
  module V1
    class CapabilitiesController < BaseController
      skip_before_action :authenticate!

      def show
        render json: ProductCapabilities.call(current_user)
      end
    end
  end
end

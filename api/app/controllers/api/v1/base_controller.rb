module Api
  module V1
    class BaseController < ApplicationController
      before_action :authenticate!
      before_action :private_response!
      rescue_from DomainError do |error|
        render json: {error: {code: error.code}}, status: error.status
      end
      rescue_from ActiveRecord::RecordNotFound do
        render json: {error: {code: "not_found"}}, status: :not_found
      end
      rescue_from ActiveRecord::RecordInvalid do |error|
        render json: {error: {code: "validation_failed", details: error.record.errors.to_hash}}, status: :unprocessable_entity
      end
      rescue_from ActiveRecord::RecordNotUnique do
        render json: {error: {code: "conflict"}}, status: :conflict
      end
      def current_session
        @current_session ||= Session.authenticate(request.headers["Authorization"]&.delete_prefix("Bearer "))
      end
      def current_user
        current_session&.user
      end
      def authenticate!
        raise DomainError.new("authentication_required", 401) unless current_user
      end
      def assemblies_access!
        authenticate!
        FeatureFlags.require!("assemblies", current_user)
        raise DomainError.new("registered_account_required", 403) unless current_user.identities.exists?
        raise DomainError.new("admission_required", 403) if Admissions.required? && !current_user.admitted_at
      end
      def private_response!
        response.set_header("Cache-Control", "no-store")
      end
      def throttle!(bucket, limit: 20)
        RateLimit.check!(bucket, limit: limit)
      end
    end
  end
end

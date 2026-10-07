Rails.application.routes.draw do
  if Rails.env.development? && ENV["DAVAR_DEV_SANDBOX"] == "1"
    get "development/mailbox", to: "development#mailbox"
    get "api/v1/development/status", to: "development#status"
  end
  get "up" => "rails/health#show", as: :rails_health_check
  namespace :api do
    namespace :v1 do
      get "capabilities", to: "capabilities#show"
      post "auth/guest", to: "auth#guest"
      get "auth/providers", to: "auth#providers"
      post "auth/exchange", to: "auth#exchange"
      delete "auth/session", to: "auth#destroy"
      post "auth/:provider/start", to: "auth#start"
      match "auth/:provider/callback", to: "auth#callback", via: [:get, :post]
      get "cities", to: "cities#index"
      patch "account/city", to: "cities#update"
      get "account", to: "account#show"
      patch "account", to: "account#update"
      patch "account/settings", to: "account#settings"
      post "account/admission", to: "account#redeem"
      patch "account/notification_preferences", to: "account#notification_preferences"
      get "account/notifications", to: "account#notifications"
      get "assemblies/leaders", to: "assemblies#leaders"
      resources :assemblies, only: [:index, :show, :create, :update] do
        member do
          post :join
          delete :leave
          get :members
          post "memberships/:membership_id/decision", action: :decide
        end
      end
      resources :endorsements, only: [:index, :create, :update]
      resources :articles, only: [:index, :show]
      resources :conversations, only: [:index, :create, :show, :destroy] do
        member do
          post :messages
          delete :memory, action: :reset_memory
        end
      end
      resources :provider_connections, only: [:index, :create, :destroy]
      get "calendar/locations", to: "calendar#locations"
      get "calendar/today", to: "calendar#today"
      get "calendar/upcoming", to: "calendar#upcoming"
    end
  end
end

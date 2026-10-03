module Api
  module V1
    class ConversationsController < BaseController
      def index
        render json: {conversations: current_user.conversations.order(updated_at: :desc).limit(100).as_json(only: %i[id title updated_at])}
      end
      def create
        conversation = current_user.conversations.create!(title: params[:title].to_s.first(120))
        render json: {id: conversation.id}, status: :created
      end
      def show
        conversation = owned!
        render json: {id: conversation.id, title: conversation.title, messages: conversation.messages.order(:created_at, :id).limit(200).as_json(only: %i[id role content context citations generation state created_at])}
      end
      def messages
        throttle!("chat/#{current_user.id}", limit: 10)
        answer = Commentary.ask!(conversation: owned!, content: params[:content], context: params[:context]&.to_unsafe_h, request_id: params[:request_id], provider: params[:provider])
        render json: answer.as_json(only: %i[id role content citations state generation])
      end
      def reset_memory
        owned!.update!(memory: nil)
        head :no_content
      end
      def destroy
        conversation = owned!
        conversation.with_lock do
          raise DomainError.new("conversation_busy", 409) if conversation.messages.where(state: "pending").exists?
          conversation.destroy!
        end
        head :no_content
      end
      private
      def owned!
        current_user.conversations.find(params[:id])
      end
    end
  end
end

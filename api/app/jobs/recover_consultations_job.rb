class RecoverConsultationsJob < ApplicationJob
  # A terminated request cannot leave a sponsored consultation reserved forever.
  def perform
    Message.where(role: "assistant", state: "pending").where("created_at < ?", 10.minutes.ago).find_each do |message|
      user = message.conversation.user
      User.transaction do
        user.lock!
        message.lock!
        next unless message.state == "pending"
        message.update!(state: "failed", content: "Response interrupted. Please try again.")
        user.decrement!(:free_consultations) if message.generation["sponsored"] && user.free_consultations > 0
      end
    rescue ActiveRecord::RecordNotFound
      # The owner may delete a conversation while recovery scans it.
      next
    end
  end
end

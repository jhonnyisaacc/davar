class AssemblyPolicy
  def initialize(user, assembly = nil)
    @user, @assembly = user, assembly
  end
  def manage?
    @assembly && @assembly.leader_id == @user.id
  end
  def create?
    @user.leader_verified && @user.completed_onboarding? && @user.profile["gender"] == "male"
  end
  def join?
    @user.completed_onboarding? && @user.profile["experience"] != "starting"
  end
end

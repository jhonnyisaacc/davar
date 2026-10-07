class AssemblyMemberships
  def self.request!(user, assembly)
    User.transaction do
      user.lock!
      raise DomainError.new("onboarding_required", 403) unless user.completed_onboarding?
      raise DomainError.new("starting_cannot_join", 403) unless AssemblyPolicy.new(user).join?
      raise DomainError.new("already_member_elsewhere", 409) if user.memberships.where(state: "member").where.not(assembly: assembly).exists?
      membership = user.memberships.find_or_initialize_by(assembly: assembly)
      return membership if membership.state.in?(%w[requested member])
      membership.update!(state: "requested")
      Notification.create!(user: assembly.leader, kind: "join_requested", data: {assembly_id: assembly.id, membership_id: membership.id})
      Notification.create!(user: user, kind: "join_requested", data: {assembly_id: assembly.id})
      membership
    end
  end
  def self.decide!(actor, membership, decision)
    raise DomainError.new("forbidden", 403) unless AssemblyPolicy.new(actor, membership.assembly).manage?
    raise DomainError.new("invalid_decision") unless decision.in?(%w[accepted declined])
    User.transaction do
      membership.user.lock!
      membership.lock!
      raise DomainError.new("request_not_pending", 409) unless membership.state == "requested"
      if decision == "accepted" && membership.user.memberships.where(state: "member").where.not(id: membership.id).exists?
        raise DomainError.new("already_member_elsewhere", 409)
      end
      membership.update!(state: decision == "accepted" ? "member" : "declined")
      Notification.create!(user: membership.user, kind: "join_#{decision}", data: {assembly_id: membership.assembly_id})
      Notification.create!(user: actor, kind: "join_#{decision}", data: {assembly_id: membership.assembly_id})
      membership
    end
  end
end

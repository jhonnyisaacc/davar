module Api
  module V1
    class AssemblySerializer
      def self.call(assembly, user, distance: nil)
        membership = assembly.memberships.find { |item| item.user_id == user.id }
        managed = assembly.leader_id == user.id
        {id: assembly.id, name: assembly.name, kind: assembly.kind, city: assembly.city,
          member_state: membership&.state.in?(%w[member requested]) ? membership.state : "not_member",
          can_manage: managed, distance_km: distance,
          meeting_url: managed || membership&.state == "member" ? assembly.meeting_url : nil}
      end
    end
  end
end

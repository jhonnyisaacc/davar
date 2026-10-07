module Api
  module V1
    class AccountSerializer
      def self.call(user)
        {active_assembly_id: user.memberships.find_by(state: "member")&.assembly_id, id: user.id, display_name: user.display_name, profile: user.profile || {},
          settings: user.settings, settings_version: user.settings_version, consultations_remaining: [1 - user.free_consultations, 0].max,
          discoverable: user.discoverable, contact_visible: user.contact_visible,
          admitted: !Admissions.required? || user.admitted_at.present?, leader_verified: user.leader_verified,
          onboarding_complete: user.completed_onboarding?, providers: user.identities.pluck(:provider)}
      end
    end
  end
end

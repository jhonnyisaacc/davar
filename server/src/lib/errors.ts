export class DomainError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(code: string, status = 422) {
		super(code);
		this.name = "DomainError";
		this.code = code;
		this.status = status;
	}
}

export function errorBody(error: DomainError): { error: { code: string } } {
	return { error: { code: error.code } };
}

export function statusFor(code: string, fallback = 422): number {
	return ERROR_STATUS[code] ?? fallback;
}

const ERROR_STATUS: Record<string, number> = {
	authentication_required: 401,
	invalid_state: 401,
	expired_or_used_link: 401,
	invalid_handoff: 401,
	expired_handoff: 401,
	provider_denied: 401,
	invalid_provider_identity: 401,
	invalid_nonce: 401,
	telegram_user_id_missing: 401,
	not_found: 404,
	registered_account_required: 403,
	admission_required: 403,
	onboarding_required: 403,
	invalid_code: 403,
	leader_verification_required: 403,
	starting_cannot_join: 403,
	forbidden: 403,
	leader_cannot_leave: 409,
	already_member_elsewhere: 409,
	request_not_pending: 409,
	settings_conflict: 409,
	identity_already_linked: 409,
	two_endorsers_maximum: 409,
	contact_support: 409,
	conversation_busy: 409,
	consultation_expired: 409,
	provider_connection_required: 402,
	provider_not_configured: 503,
	provider_not_supported: 503,
	free_provider_not_configured: 503,
	empty_provider_response: 503,
	provider_response_unavailable: 503,
	invalid_provider_response: 503,
	provider_unavailable: 503,
	development_simulated_failure: 503,
	calendar_domain_unavailable: 503,
	rate_limited: 429,
	conflict: 409,
	validation_failed: 422,
};

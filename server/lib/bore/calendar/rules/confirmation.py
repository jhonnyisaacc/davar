from calendar.models.enums import NewMoonSource, VisibilityMethod
from calendar.models.new_moon_observation import NewMoonObservation

ISRAEL_COUNTRY = "IL"


def qualifies_for_automatic_confirmation(observation: NewMoonObservation) -> bool:
    """Automatic confirmation requires INMS + Israel + explicit unaided seeing."""
    return (
        observation.source == NewMoonSource.ISRAELI_NEW_MOON_SOCIETY
        and observation.country == ISRAEL_COUNTRY
        and observation.visibility_method == VisibilityMethod.UNAIDED
        and observation.verified
    )

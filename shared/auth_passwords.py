from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from shared.config import get_settings


def _make_hasher() -> PasswordHasher:
    settings = get_settings()
    return PasswordHasher(
        time_cost=settings.ARGON2_TIME_COST,
        memory_cost=settings.ARGON2_MEMORY_COST,
        parallelism=settings.ARGON2_PARALLELISM,
    )


_hasher = _make_hasher()
# Fixed hash to verify unknown-email logins against, so the response takes
# the same time as a wrong-password attempt on a real account — prevents
# email enumeration via a timing side-channel.
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing-parity")


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(password_hash: str, plain: str) -> bool:
    try:
        _hasher.verify(password_hash, plain)
        return True
    except VerifyMismatchError:
        return False


def verify_against_dummy(plain: str) -> bool:
    """Always returns False; exists purely to burn the same CPU time as a
    real verify_password call, for the login-with-unknown-email path."""
    verify_password(_DUMMY_HASH, plain)
    return False

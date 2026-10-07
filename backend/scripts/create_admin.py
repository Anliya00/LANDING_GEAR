"""Create the first administrator account.

Run once, after migration 001. There is no self-registration and no default
password in the source — the password is either given on the command line or
generated here and printed a single time.

    python -m scripts.create_admin --username jdoe --name "J Doe"
"""

from __future__ import annotations

import argparse
import secrets
import string
import sys

from app.db import users_repo
from app.db.pool import close_pool, connection, init_pool
from app.security.passwords import hash_password

ALPHABET = string.ascii_letters + string.digits + "!@#$%^&*-_"


def generate_password(length: int = 20) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", required=True)
    parser.add_argument("--name", required=True, help="Display name")
    parser.add_argument("--email")
    parser.add_argument(
        "--password",
        help="Leave unset to generate one. It is printed once and not stored in plain text.",
    )
    args = parser.parse_args()

    password = args.password or generate_password()
    generated = args.password is None

    init_pool()
    try:
        with connection() as conn:
            if users_repo.get_by_username(conn, args.username):
                print(f"User '{args.username}' already exists.", file=sys.stderr)
                return 1

            user_id = users_repo.create_user(
                conn,
                username=args.username,
                display_name=args.name,
                password_hash=hash_password(password),
                email=args.email,
                must_change=generated,
            )
            users_repo.grant_role(conn, user_id, "admin")
    finally:
        close_pool()

    print(f"Created administrator '{users_repo.normalise_username(args.username)}'")
    if generated:
        print(f"Password: {password}")
        print("Shown once. The account must change it at first sign-in.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

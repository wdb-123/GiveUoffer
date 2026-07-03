from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .db import connect_database

TENANT_PERMISSIONS: dict[str, list[str]] = {
    "owner": [
        "tenant.manage",
        "users.manage",
        "agent.run",
        "agent.approve",
        "workspace.read",
        "workspace.write",
        "applications.read",
        "applications.write",
        "billing.view",
        "sync.cloud",
    ],
    "admin": [
        "users.manage",
        "agent.run",
        "agent.approve",
        "workspace.read",
        "workspace.write",
        "applications.read",
        "applications.write",
        "billing.view",
    ],
    "member": ["agent.run", "workspace.read", "workspace.write", "applications.read", "applications.write"],
    "viewer": ["workspace.read", "applications.read"],
}


@dataclass
class AuthStore:
    db_path: Path

    def create_account(self, input: dict[str, Any]) -> dict[str, Any]:
        email = _normalize_email(input.get("email"))
        password = str(input.get("password") or "")
        if not email:
            raise ValueError("Email is required")
        if not _is_valid_email(email):
            raise ValueError("A valid email is required")
        _validate_new_password(password)

        now = _now()
        account_id = _create_id("acct")
        tenant_id = _create_id("tenant")
        tenant_name = str(input.get("tenantName") or "Personal Workspace").strip() or "Personal Workspace"
        display_name = str(input.get("displayName") or email.split("@")[0] or email).strip()
        password_hash, password_salt = _hash_password(password)

        with connect_database(self.db_path) as conn:
            self._delete_expired_sessions(conn)
            if self._find_account_by_email(conn, email):
                raise ValueError("Account already exists")
            conn.execute(
                """
                INSERT INTO accounts (id, email, display_name, password_hash, password_salt, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (account_id, email, display_name, password_hash, password_salt, now),
            )
            conn.execute(
                "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
                (tenant_id, tenant_name, self._unique_tenant_slug(conn, tenant_name), now),
            )
            conn.execute(
                "INSERT INTO tenant_memberships (tenant_id, account_id, role, created_at) VALUES (?, ?, ?, ?)",
                (tenant_id, account_id, "owner", now),
            )
            conn.commit()
            return self._create_session(conn, account_id, tenant_id, bool(input.get("remember")))

    def login(self, input: dict[str, Any]) -> dict[str, Any]:
        email = _normalize_email(input.get("email"))
        password = str(input.get("password") or "")
        if not email:
            raise ValueError("Email is required")
        if not password:
            raise ValueError("Password is required")

        with connect_database(self.db_path) as conn:
            self._delete_expired_sessions(conn)
            account = self._find_account_by_email(conn, email)
            if not account or not _verify_password(password, account["password_hash"], account["password_salt"]):
                raise ValueError("Invalid email or password")
            memberships = self._list_membership_rows(conn, account["id"])
            if not memberships:
                raise ValueError("Account has no tenant membership")
            return self._create_session(conn, account["id"], memberships[0]["id"], bool(input.get("remember")))

    def get_session(self, token: str | None) -> dict[str, Any] | None:
        clean_token = str(token or "").strip()
        if not clean_token:
            return None
        with connect_database(self.db_path) as conn:
            row = self._session_row(conn, clean_token)
            if not row:
                return None
            if _parse_iso(row["expires_at"]) <= datetime.now(UTC):
                conn.execute("DELETE FROM auth_sessions WHERE token = ?", (clean_token,))
                conn.commit()
                return None
            return self._hydrate_session(conn, row)

    def require_session(self, token: str | None) -> dict[str, Any]:
        session = self.get_session(token)
        if not session:
            raise PermissionError("A valid Ucareer session is required")
        return session

    def logout(self, token: str | None) -> bool:
        with connect_database(self.db_path) as conn:
            result = conn.execute("DELETE FROM auth_sessions WHERE token = ?", (str(token or "").strip(),))
            conn.commit()
            return result.rowcount > 0

    def create_tenant(self, token: str | None, input: dict[str, Any]) -> dict[str, Any]:
        session = self.require_session(token)
        name = str(input.get("name") or "").strip()
        if not name:
            raise ValueError("Tenant name is required")
        tenant_id = _create_id("tenant")
        now = _now()
        with connect_database(self.db_path) as conn:
            conn.execute(
                "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
                (tenant_id, name, self._unique_tenant_slug(conn, name), now),
            )
            conn.execute(
                "INSERT INTO tenant_memberships (tenant_id, account_id, role, created_at) VALUES (?, ?, ?, ?)",
                (tenant_id, session["account"]["id"], "owner", now),
            )
            conn.execute("UPDATE auth_sessions SET active_tenant_id = ? WHERE token = ?", (tenant_id, session["token"]))
            conn.commit()
        return self.require_session(token)

    def switch_tenant(self, token: str | None, input: dict[str, Any]) -> dict[str, Any]:
        session = self.require_session(token)
        tenant_id = str(input.get("tenantId") or "").strip()
        if not tenant_id:
            raise ValueError("Tenant is required")
        memberships = session["memberships"]
        if not any(item["tenant"]["id"] == tenant_id for item in memberships):
            raise ValueError("Tenant membership not found")
        with connect_database(self.db_path) as conn:
            conn.execute("UPDATE auth_sessions SET active_tenant_id = ? WHERE token = ?", (tenant_id, session["token"]))
            conn.commit()
        return self.require_session(token)

    def list_tenant_members(self, token: str | None) -> dict[str, Any]:
        session = self.require_session(token)
        with connect_database(self.db_path) as conn:
            return self._tenant_members_overview(conn, session["activeTenant"]["id"])

    def add_tenant_member(self, token: str | None, input: dict[str, Any]) -> dict[str, Any]:
        session = self.require_session(token)
        _require_permission(session, "users.manage")
        email = _normalize_email(input.get("email"))
        role = _normalize_assignable_role(input.get("role"))
        with connect_database(self.db_path) as conn:
            account = self._find_account_by_email(conn, email)
            if not account:
                raise ValueError("Account not found. Ask the user to create a local account first.")
            if account["id"] == session["account"]["id"]:
                raise ValueError("You are already a member of this tenant")
            conn.execute(
                "INSERT INTO tenant_memberships (tenant_id, account_id, role, created_at) VALUES (?, ?, ?, ?)",
                (session["activeTenant"]["id"], account["id"], role, _now()),
            )
            conn.commit()
            return self._tenant_members_overview(conn, session["activeTenant"]["id"])

    def update_tenant_member_role(self, token: str | None, account_id: str, input: dict[str, Any]) -> dict[str, Any]:
        session = self.require_session(token)
        _require_permission(session, "users.manage")
        if account_id == session["account"]["id"]:
            raise ValueError("You cannot change your own role")
        role = _normalize_assignable_role(input.get("role"))
        with connect_database(self.db_path) as conn:
            target = conn.execute(
                "SELECT role FROM tenant_memberships WHERE tenant_id = ? AND account_id = ?",
                (session["activeTenant"]["id"], account_id),
            ).fetchone()
            if not target:
                raise ValueError("Tenant member not found")
            if _normalize_role(target["role"]) == "owner":
                raise ValueError("Owner role cannot be changed")
            conn.execute(
                "UPDATE tenant_memberships SET role = ? WHERE tenant_id = ? AND account_id = ?",
                (role, session["activeTenant"]["id"], account_id),
            )
            conn.commit()
            return self._tenant_members_overview(conn, session["activeTenant"]["id"])

    def remove_tenant_member(self, token: str | None, account_id: str) -> dict[str, Any]:
        session = self.require_session(token)
        _require_permission(session, "users.manage")
        if account_id == session["account"]["id"]:
            raise ValueError("You cannot remove yourself from this tenant")
        with connect_database(self.db_path) as conn:
            target = conn.execute(
                "SELECT role FROM tenant_memberships WHERE tenant_id = ? AND account_id = ?",
                (session["activeTenant"]["id"], account_id),
            ).fetchone()
            if not target:
                raise ValueError("Tenant member not found")
            if _normalize_role(target["role"]) == "owner":
                raise ValueError("Owner cannot be removed")
            conn.execute(
                "DELETE FROM tenant_memberships WHERE tenant_id = ? AND account_id = ?",
                (session["activeTenant"]["id"], account_id),
            )
            conn.execute(
                "DELETE FROM auth_sessions WHERE account_id = ? AND active_tenant_id = ?",
                (account_id, session["activeTenant"]["id"]),
            )
            conn.commit()
            return self._tenant_members_overview(conn, session["activeTenant"]["id"])

    def _create_session(self, conn: sqlite3.Connection, account_id: str, tenant_id: str, remember: bool) -> dict[str, Any]:
        created_at = datetime.now(UTC)
        expires_at = created_at + timedelta(days=30 if remember else 1)
        token = f"sess_{secrets.token_hex(32)}"
        conn.execute(
            "INSERT INTO auth_sessions (token, account_id, active_tenant_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
            (token, account_id, tenant_id, created_at.isoformat().replace("+00:00", "Z"), expires_at.isoformat().replace("+00:00", "Z")),
        )
        conn.commit()
        row = self._session_row(conn, token)
        if row is None:
            raise RuntimeError("Session creation failed")
        return self._hydrate_session(conn, row)

    def _session_row(self, conn: sqlite3.Connection, token: str) -> sqlite3.Row | None:
        return conn.execute(
            """
            SELECT auth_sessions.token, auth_sessions.active_tenant_id,
                   auth_sessions.created_at AS session_created_at,
                   auth_sessions.expires_at, accounts.*
            FROM auth_sessions
            JOIN accounts ON accounts.id = auth_sessions.account_id
            WHERE auth_sessions.token = ?
            """,
            (token,),
        ).fetchone()

    def _hydrate_session(self, conn: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        memberships = [self._to_membership(item) for item in self._list_membership_rows(conn, row["id"])]
        active = next((item for item in memberships if item["tenant"]["id"] == row["active_tenant_id"]), memberships[0] if memberships else None)
        if not active:
            raise ValueError("Session has no active tenant")
        return {
            "token": row["token"],
            "account": self._to_account(row),
            "activeTenant": active["tenant"],
            "role": active["role"],
            "permissions": active["permissions"],
            "memberships": memberships,
            "createdAt": row["session_created_at"],
            "expiresAt": row["expires_at"],
        }

    def _find_account_by_email(self, conn: sqlite3.Connection, email: str) -> sqlite3.Row | None:
        return conn.execute("SELECT * FROM accounts WHERE email = ?", (email,)).fetchone()

    def _list_membership_rows(self, conn: sqlite3.Connection, account_id: str) -> list[sqlite3.Row]:
        return list(conn.execute(
            """
            SELECT tenants.*, tenant_memberships.role
            FROM tenant_memberships
            JOIN tenants ON tenants.id = tenant_memberships.tenant_id
            WHERE tenant_memberships.account_id = ?
            ORDER BY tenants.created_at ASC
            """,
            (account_id,),
        ).fetchall())

    def _tenant_members_overview(self, conn: sqlite3.Connection, tenant_id: str) -> dict[str, Any]:
        tenant = conn.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()
        if not tenant:
            raise ValueError("Tenant not found")
        members = conn.execute(
            """
            SELECT tenant_memberships.account_id, tenant_memberships.role,
                   tenant_memberships.created_at AS membership_created_at,
                   accounts.email, accounts.display_name, accounts.created_at AS account_created_at
            FROM tenant_memberships
            JOIN accounts ON accounts.id = tenant_memberships.account_id
            WHERE tenant_memberships.tenant_id = ?
            ORDER BY CASE tenant_memberships.role
              WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,
              accounts.email ASC
            """,
            (tenant_id,),
        ).fetchall()
        return {"tenant": self._to_tenant(tenant), "members": [self._to_tenant_member(row) for row in members]}

    def _unique_tenant_slug(self, conn: sqlite3.Connection, name: str) -> str:
        base = _slugify(name) or "workspace"
        for index in range(1000):
            slug = base if index == 0 else f"{base}-{index + 1}"
            exists = conn.execute("SELECT id FROM tenants WHERE slug = ?", (slug,)).fetchone()
            if not exists:
                return slug
        return f"{base}-{secrets.token_hex(3)}"

    def _to_account(self, row: sqlite3.Row) -> dict[str, Any]:
        return {"id": row["id"], "email": row["email"], "displayName": row["display_name"], "createdAt": row["created_at"]}

    def _to_tenant(self, row: sqlite3.Row) -> dict[str, Any]:
        return {"id": row["id"], "name": row["name"], "slug": row["slug"], "createdAt": row["created_at"]}

    def _to_membership(self, row: sqlite3.Row) -> dict[str, Any]:
        role = _normalize_role(row["role"])
        return {"tenant": self._to_tenant(row), "role": role, "permissions": TENANT_PERMISSIONS[role]}

    def _to_tenant_member(self, row: sqlite3.Row) -> dict[str, Any]:
        role = _normalize_role(row["role"])
        return {
            "account": {
                "id": row["account_id"],
                "email": row["email"],
                "displayName": row["display_name"] or row["email"],
                "createdAt": row["account_created_at"] or row["membership_created_at"],
            },
            "role": role,
            "permissions": TENANT_PERMISSIONS[role],
            "createdAt": row["membership_created_at"],
        }

    def _delete_expired_sessions(self, conn: sqlite3.Connection) -> None:
        conn.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (_now(),))
        conn.commit()


def _normalize_email(value: Any) -> str:
    return str(value or "").strip().lower()


def _is_valid_email(value: str) -> bool:
    return re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", value) is not None


def _validate_new_password(password: str) -> None:
    if not password:
        raise ValueError("Password is required")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
        raise ValueError("Password must include letters and numbers")


def _hash_password(password: str) -> tuple[str, str]:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64)
    return digest.hex(), salt


def _verify_password(password: str, password_hash: str, salt: str) -> bool:
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
    return hmac.compare_digest(digest, password_hash)


def _normalize_role(value: Any) -> str:
    return value if value in TENANT_PERMISSIONS else "viewer"


def _normalize_assignable_role(value: Any) -> str:
    if value in {"admin", "member", "viewer"}:
        return str(value)
    raise ValueError("Assignable role must be admin, member, or viewer")


def _require_permission(session: dict[str, Any], permission: str) -> None:
    if permission not in session.get("permissions", []):
        raise PermissionError(f"Permission required: {permission}")


def _create_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(12)}"


def _slugify(value: str) -> str:
    return re.sub(r"(^-+|-+$)", "", re.sub(r"[^a-z0-9]+", "-", value.strip().lower()))


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


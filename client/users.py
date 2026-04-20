from __future__ import annotations

from client._base import BaseClient
from app.schemas.user import UserResponse


class UsersClient(BaseClient):

    def get_me(self) -> UserResponse:
        resp = self._get("/users/me")
        return UserResponse.model_validate(resp.json())

    def update_me(
        self,
        full_name: str | None = None,
        email: str | None = None,
    ) -> UserResponse:
        data = {}
        if full_name is not None:
            data["full_name"] = full_name
        if email is not None:
            data["email"] = email
        resp = self._put("/users/me", json=data)
        return UserResponse.model_validate(resp.json())

    def change_password(
        self, current_password: str, new_password: str
    ) -> None:
        self._put("/users/me/password", json={
            "current_password": current_password,
            "new_password": new_password,
        })

    def delete_account(self, password: str) -> None:
        self._delete_with_body("/users/me", json={"password": password})

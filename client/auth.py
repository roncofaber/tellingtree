from __future__ import annotations

from client._base import BaseClient
from app.schemas.user import Token, UserResponse


class AuthClient(BaseClient):

    def register(
        self,
        email: str,
        username: str,
        password: str,
        full_name: str | None = None,
    ) -> UserResponse:
        data = {"email": email, "username": username, "password": password}
        if full_name is not None:
            data["full_name"] = full_name
        resp = self._post("/auth/register", json=data)
        return UserResponse.model_validate(resp.json())

    def login(self, username: str, password: str) -> Token:
        resp = self._post("/auth/login", json={
            "username": username,
            "password": password,
        })
        token = Token.model_validate(resp.json())
        self._root._access_token = token.access_token
        self._root._refresh_token = token.refresh_token
        return token

    def refresh(self) -> Token:
        if not self._root._refresh_token:
            raise RuntimeError("No refresh token available. Call login() first.")
        resp = self._post("/auth/refresh", json={
            "refresh_token": self._root._refresh_token,
        })
        token = Token.model_validate(resp.json())
        self._root._access_token = token.access_token
        self._root._refresh_token = token.refresh_token
        return token

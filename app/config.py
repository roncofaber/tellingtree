from pydantic import model_validator
from pydantic_settings import BaseSettings

_INSECURE_SECRETS = {"dev-secret-key-change-in-prod", "change-me-in-production"}


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://tellingtree:tellingtree_dev_password@localhost:5432/tellingtree_db"
    environment: str = "development"

    jwt_secret_key: str = "dev-secret-key-change-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_minutes: int = 60 * 24 * 7

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    max_upload_size_bytes: int = 500 * 1024 * 1024
    storage_path: str = "storage/media"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @model_validator(mode="after")
    def _check_production_secret(self):
        if self.environment == "production" and self.jwt_secret_key in _INSECURE_SECRETS:
            raise ValueError(
                "JWT_SECRET_KEY must be changed from the default value in production. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
            )
        return self


settings = Settings()

"""Configuración central de la aplicación mediante variables de entorno."""

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://fleet:fleet_secret@localhost:5432/fleet_manager"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "change_me_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 horas
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"

    # Variables individuales de PostgreSQL (Railway las provee aunque no haya DATABASE_URL)
    PGHOST: str = ""
    PGPORT: str = "5432"
    PGUSER: str = ""
    PGPASSWORD: str = ""
    PGDATABASE: str = ""

    # Firebase
    FIREBASE_CREDENTIALS_PATH: str = ""

    # Resend (email)
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "Fleet Manager <noreply@fleetmanager.app>"

    # OpenRouteService (ruteo vehicular)
    ORS_API_KEY: str = ""

    # Google Maps (geocoding de direcciones). Si no está seteada,
    # el geocoding cae a Nominatim (OpenStreetMap, gratis).
    GOOGLE_MAPS_API_KEY: str = ""

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            if self.SECRET_KEY == "change_me_in_production":
                raise ValueError("SECRET_KEY debe configurarse en producción (variable de entorno SECRET_KEY)")
            if "localhost" in self.DATABASE_URL:
                raise ValueError("DATABASE_URL no puede apuntar a localhost en producción")
        return self

    @model_validator(mode="before")
    @classmethod
    def build_database_url(cls, values: dict) -> dict:
        url = values.get("DATABASE_URL", "")
        # Si no hay DATABASE_URL pero sí variables PG*, construir la URL
        if (not url or "localhost" in url) and values.get("PGHOST"):
            values["DATABASE_URL"] = (
                f"postgresql+asyncpg://{values['PGUSER']}:{values['PGPASSWORD']}"
                f"@{values['PGHOST']}:{values.get('PGPORT', '5432')}/{values['PGDATABASE']}"
            )
        return values

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def fix_database_url(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        if v.startswith("postgres://"):
            return "postgresql+asyncpg://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            return "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v


settings = Settings()
